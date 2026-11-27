import { AsaasClient, type AsaasPayment, type CreatePaymentInput } from './asaas-client.ts';
import { saoPauloDate } from './dates.ts';
import { errors, HttpError, readJson, route, WEBHOOK_BODY_LIMIT } from './http.ts';
import { centsToReais } from './money.ts';
import { isUuid, secretMatches } from './secrets.ts';

export const sandboxContract: RidePaymentContract = { prefix: 'we-ride-sandbox:', invoiceHost: 'sandbox.asaas.com', description: 'WorkEasy · trecho de teste' };
export type RemoteRidePayment = AsaasPayment & {
  customer: string; currency?: string;
  split?: { id?: string; walletId?: string; fixedValue?: number; totalValue?: number; status?: string }[];
  refunds?: { status: string; value: number; refundedSplits?: { id: string; value: number; done: boolean }[] }[] | null;
};
type Payment = RemoteRidePayment;
export interface RidePaymentContract {
  prefix: string;
  description: string;
  invoiceHost: string;
  prepareSplit?(api: AsaasClient, intent: Intent): Promise<CreatePaymentInput['split']>;
  reconcile?(deps: RidePspDeps, intent: Intent, remote: Payment, observed: Observation): Promise<unknown>;
}
export interface Intent {
  leg_id: string; customer: string; amount_cents: number; payment_id: string | null; create: boolean;
  wallet?: string; driver_cents?: number; extras_cents?: number;
}
export interface Observation {
  payment: string; customer: string; amount: number; status: string; refunded: number; invoice: string | null;
  pspFee?: number; splitCents?: number; paidToDriver?: number; returnedByDriver?: number; reason?: string;

}
export interface RidePspDeps {
  reportAmbiguous?(leg: string, ids: string[]): Promise<void>;
  api: AsaasClient | null; token: string; siteUrl?: string; allowDevOrigins?: boolean;
  now(): Date; session(req: Request): Promise<string | null>;
  prepare(leg: string, user: string): Promise<Intent>; find(leg: string): Promise<Intent | null>;
  claimSend(leg: string): Promise<boolean>;
  observe(leg: string, data: Observation): Promise<unknown>;
}
const unavailable = () => new HttpError(503, 'not_configured', 'Canal financeiro indisponível.');
class ProviderMismatch extends HttpError {
  constructor() { super(409, 'ride_psp_review', 'A operação precisa conferir esta cobrança.'); }
}
const inconsistent = () => new ProviderMismatch();
const uncertain = () => new HttpError(409, 'ride_psp_unknown', 'O processador ainda não confirmou a situação. Consulte novamente antes de tentar outra cobrança.');

export function asCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw inconsistent();
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents / 100 - value) > 0.000001) throw inconsistent();
  return cents;
}
async function apply(contract: RidePaymentContract, deps: RidePspDeps, intent: Intent, payment: Payment) {
  if (typeof payment.id !== 'string' || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(payment.id)) throw inconsistent();
  if ((intent.payment_id && payment.id !== intent.payment_id) ||
    payment.customer !== intent.customer || (payment.currency != null && payment.currency !== 'BRL') || payment.billingType !== 'PIX' || asCents(payment.value) !== intent.amount_cents ||
    payment.externalReference !== contract.prefix + intent.leg_id) {
    if (!contract.reconcile) throw inconsistent();
    return await deps.observe(intent.leg_id, { payment: payment.id, customer: payment.customer, amount: asCents(payment.value),
      status: 'review', refunded: 0, invoice: null, reason: 'unverified_payment' });
  }
  let status: string;
  if (payment.deleted) status = 'cancelled';
  else if (['RECEIVED', 'CONFIRMED', 'REFUNDED'].includes(payment.status)) status = 'paid';
  else if (['PENDING', 'OVERDUE'].includes(payment.status)) status = 'pending';
  else status = 'review';
  const refunds = payment.refunds ?? [];
  if (!Array.isArray(refunds)) throw inconsistent();
  const refunded = refunds.filter(r => r.status === 'DONE').reduce((total, r) => total + asCents(r.value), 0);
  // REFUNDED returned by the PSP confirms a full reversal. For other statuses
  // count only its completed refunds, never an unconfirmed webhook amount.
  const reversed = payment.status === 'REFUNDED' ? intent.amount_cents : refunded;
  if (refunded > intent.amount_cents) throw inconsistent();
  const base = 'https://' + contract.invoiceHost + '/i/';
  const invoice = payment.invoiceUrl?.startsWith(base) && /^[a-zA-Z0-9_-]+$/.test(payment.invoiceUrl.slice(base.length)) ? payment.invoiceUrl : null;
  const observed: Observation = {
    payment: payment.id, customer: payment.customer, amount: intent.amount_cents, status, refunded: reversed, invoice,
  };
  if (contract.reconcile) return await contract.reconcile(deps, intent, payment, observed);
  return await deps.observe(intent.leg_id, observed);
}

async function recordCanonical(contract: RidePaymentContract, deps: RidePspDeps, intent: Intent, payment: Payment) {
  try {
    return await apply(contract, deps, intent, payment);
  } catch (error) {
    // Preserve malformed monetary fields from a known live payment as an
    // operational review. A DB/RPC failure still causes a retryable error.
    if (!contract.reconcile || !(error instanceof ProviderMismatch) ||
        !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(payment.id)) throw error;
    return await deps.observe(intent.leg_id, { payment: payment.id, customer: payment.customer, amount: intent.amount_cents,
      status: 'review', refunded: 0, invoice: null, reason: 'unverified_provider_amount' });
  }
}

export function rideCheckout(req: Request, deps: RidePspDeps, contract: RidePaymentContract): Promise<Response> {
  return route(req, { methods: ['POST'], siteUrl: deps.siteUrl, allowDevOrigins: deps.allowDevOrigins }, async () => {
    const user = await deps.session(req);
    if (!user) throw new HttpError(401, 'not_authenticated', 'Entre para consultar esta cobrança.');
    const body = await readJson(req) as { leg_id?: unknown } | null;
    if (!body || typeof body.leg_id !== 'string' || !isUuid(body.leg_id)) throw errors.invalidInput(['Identificador inválido.']);
    if (!deps.api || !deps.token) throw unavailable();
    const intent = await deps.prepare(body.leg_id, user);
    const api = deps.api;
    let remote: Payment | undefined;
    if (intent.payment_id) {
      const found = await api.getPayment(intent.payment_id);
      if (!found) throw uncertain();
      remote = found as Payment;
    } else {
      const reference = contract.prefix + intent.leg_id;
      const page = await api.request<{ data: Payment[]; hasMore: boolean; totalCount: number }>('GET', '/payments?externalReference=' + encodeURIComponent(reference) + '&limit=2');
      if (!Array.isArray(page.data) || page.hasMore !== false || page.totalCount !== page.data.length || page.data.length > 1) {
        if (Array.isArray(page.data) && page.data.length > 1) {
          await deps.reportAmbiguous?.(intent.leg_id, page.data.map(payment => payment.id));
        }
        throw inconsistent();
      }
      remote = page.data[0];
      if (!remote) {
        if (!intent.create) throw uncertain();
        const split = await contract.prepareSplit?.(api, intent);
        if (!await deps.claimSend(intent.leg_id)) throw uncertain();
        try {
          remote = await api.createPayment({ customer: intent.customer, billingType: 'PIX', value: centsToReais(intent.amount_cents),
            dueDate: saoPauloDate(deps.now()), externalReference: reference, description: contract.description, ...(split ? { split } : {}) }) as Payment;
        } catch { throw uncertain(); }
      }
    }
    // Search and creation responses can omit split details. For live, the
    // invoice link is released only against the individual canonical charge.
    if (contract.reconcile && !intent.payment_id) {
      if (!remote.id || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(remote.id)) throw inconsistent();
      const canonical = await api.getPayment(remote.id);
      if (!canonical || canonical.id !== remote.id) throw uncertain();
      remote = canonical as Payment;
    }
    return { data: await recordCanonical(contract, deps, intent, remote) };
  });
}

export function rideWebhook(req: Request, deps: RidePspDeps, contract: RidePaymentContract): Promise<Response> {
  return route(req, { methods: ['POST'] }, async () => {
    if (!deps.api || !deps.token) throw unavailable();
    if (!secretMatches(req.headers.get('asaas-access-token'), deps.token)) throw new HttpError(401, 'invalid_token', 'Token inválido.');
    const body = await readJson(req, WEBHOOK_BODY_LIMIT) as { payment?: { id?: unknown } } | null;
    const id = body?.payment?.id;
    if (typeof id !== 'string' || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(id)) throw errors.invalidInput(['Identificador inválido.']);
    // Notifications can arrive out of order. Re-read the canonical charge
    // from this dedicated PSP account; never book the payload as a receipt.
    const remote = await deps.api.getPayment(id) as Payment | null;
    if (!remote || remote.id !== id) throw uncertain();
    if (!remote.externalReference?.startsWith(contract.prefix)) return { data: { ignored: true } };
    const leg = remote.externalReference.slice(contract.prefix.length);
    if (!isUuid(leg)) throw inconsistent();
    const intent = await deps.find(leg);
    if (!intent) throw inconsistent();
    return { data: await recordCanonical(contract, deps, intent, remote) };
  });
}
