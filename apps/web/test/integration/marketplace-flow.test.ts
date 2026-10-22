// Fluxo do produto de ponta a ponta, contra a stack Supabase REAL (sem mocks),
// pela mesma API que a interface usa: cliente pede, prestador se cadastra e é
// aprovado, propõe, o cliente aceita, trava trabalhista, pagamento como o webhook
// faria, avaliação, vazamento entre contas, orçamento público e LGPD.
//
// O que este arquivo assume (e só isso):
//  * A stack local está de pé (`npx supabase start`), com as migrations aplicadas e
//    `supabase/seed.sql` carregado: catálogo, políticas e bairros de São Paulo.
//  * Há ao menos uma ocupação doméstica na política (`labor_lock = true` e sem
//    `registro_profissional` entre as verificações) e ao menos um bairro. As ocupações
//    são escolhidas pela política, não por slug, então o teste vale para o catálogo
//    pequeno de hoje e para o grande.
//  * `platform_settings` está nos valores de fábrica do seed: `proposal_limit` é lido
//    e respeitado como está; `labor_lock_days_per_week` é 2 (o terceiro dia da semana
//    falha); comissão e pagamento retido desligados (`commission_enabled = false`).
//  * O Auth local confirma e-mail na criação pela API admin e aceita senha. O cadastro
//    por senha é só de teste: o produto usa login por código.
//  * O fuso das regras por dia e por semana é America/Sao_Paulo (UTC-3 o ano todo).
//  * As Edge Functions não rodam aqui: o webhook de pagamento é reproduzido com a
//    chave de serviço (grava `payments` e chama `transition_booking`), como ele faz.
//  * Cada arquivo cria os próprios usuários (e-mails `it<id>-...@example.com`) e os
//    remove no fim, junto com pagamentos, atendimentos e arquivos de teste. O
//    `audit_log` é só de inserção e guarda a trilha das execuções.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseTstzRange } from '../../lib/tstzrange';
import {
  expectDenied,
  expectRule,
  loadPolicies,
  makeApprovedProvider,
  must,
  pickDomestic,
  pickNeighborhood,
  proposalLimit,
  registerProvider,
  submitDocument,
  visibleIds,
  type Neighborhood,
  type PolicyRow,
  type ProviderSetup,
  type UploadedDocument,
} from './support/domain';
import { addDays, mondayAtLeast, spRange, spToday } from './support/time';
import { DOCUMENTS_BUCKET, World, type TestUser } from './support/world';

const CLIENT_PHONE = '11987654321';
const OPEN_REQUEST_COLUMNS = [
  'created_at',
  'description',
  'expires_at',
  'id',
  'my_proposal_id',
  'my_proposal_status',
  'neighborhood_id',
  'neighborhood_name',
  'occupation_slug',
  'preferred_dates',
  'proposal_count',
  'urgent',
];

describe('fluxo do produto contra o Supabase real', () => {
  const world = new World();
  let policy: PolicyRow;
  let hood: Neighborhood;
  let limit: number;

  let admin: TestUser;
  let client: TestUser; // o cliente do fluxo
  let client2: TestUser; // outro cliente, que não participa de nada
  let provider: TestUser; // P1, o prestador do fluxo
  let providerSlug = '';
  let providerDocuments: UploadedDocument[] = [];
  let extras: ProviderSetup[] = []; // outros prestadores aprovados da mesma ocupação
  let outsider: TestUser; // o último deles: nunca chega a propor

  let requestId = '';
  let proposalId = '';
  let bookingId = '';
  let paymentId = '';
  let reviewId = '';

  // Semana ISO de São Paulo usada na trava: segunda W, terça W, quarta W, domingo W, segunda W+1.
  const monday = mondayAtLeast(14);
  const tuesday = addDays(monday, 1);
  const wednesday = addDays(monday, 2);
  const sunday = addDays(monday, 6);
  const nextMonday = addDays(monday, 7);

  let tuesdayBookingId = '';
  const flowBookingIds: string[] = [];

  /** O cliente abre um pedido e o prestador envia proposta, como a interface faria. */
  const askAndPropose = async (asClient: TestUser, asProvider: TestUser, text: string) => {
    const request = must(
      await asClient.client
        .from('requests')
        .insert({
          occupation_slug: policy.occupation_slug,
          neighborhood_id: hood.id,
          description: `${text} (teste de integração ${world.runId})`,
        })
        .select('id')
        .single(),
      'pedido',
    );
    const proposal = must(
      await asProvider.client.from('proposals').insert({ request_id: request.id, price_cents: 18000 }).select('id').single(),
      'proposta',
    );
    return { requestId: request.id, proposalId: proposal.id };
  };

  const accept = (asClient: TestUser, proposal: string, range: string) =>
    asClient.client.rpc('accept_proposal', { p_proposal: proposal, p_period: range });

  beforeAll(async () => {
    const policies = await loadPolicies(world.anon);
    policy = pickDomestic(policies);
    hood = await pickNeighborhood(world.anon);
    limit = await proposalLimit(world.anon);

    admin = await world.createAdmin('admin');
    client = await world.createUser('cliente', { phone: CLIENT_PHONE });
    client2 = await world.createUser('outro-cliente');
    provider = await world.createUser('prestador');
  });

  afterAll(async () => {
    await world.cleanup();
  });

  // -------------------------------------------------------------------------
  // (a) pedido do cliente
  // -------------------------------------------------------------------------
  describe('(a) o cliente cria um pedido', () => {
    it('cria o pedido aberto, com vencimento padrão, e só o dono pode cancelá-lo', async () => {
      const row = must(
        await client.client
          .from('requests')
          .insert({
            occupation_slug: policy.occupation_slug,
            neighborhood_id: hood.id,
            description: `Preciso de ajuda em casa (teste de integração ${world.runId})`,
            preferred_dates: 'Segunda ou terça pela manhã',
            urgent: false,
          })
          .select('id, status, client_id, expires_at')
          .single(),
        'pedido',
      );
      requestId = row.id;
      expect(row.status).toBe('open');
      expect(row.client_id).toBe(client.id);
      const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    });

    it('recusa pedido sem texto suficiente, em nome de outra pessoa ou sem login', async () => {
      const base = { occupation_slug: policy.occupation_slug, neighborhood_id: hood.id };
      const short = await client.client.from('requests').insert({ ...base, description: 'curto' });
      expect(short.error?.code).toBe('23514');

      await expectDenied(
        client.client.from('requests').insert({ ...base, client_id: client2.id, description: 'Pedido em nome de outra pessoa' }),
      );
      await expectDenied(world.anon.from('requests').insert({ ...base, description: 'Pedido sem estar logado, não vale' }));
    });

    it('o cliente não consegue tornar o pedido "casado" por conta própria', async () => {
      await expectRule(client.client.from('requests').update({ status: 'matched' }).eq('id', requestId), 'invalid_transition');
      const { data } = await world.service.from('requests').select('status').eq('id', requestId).single();
      expect(data?.status).toBe('open');
    });
  });

  // -------------------------------------------------------------------------
  // (b) cadastro do prestador, documentos, análise e aprovação
  // -------------------------------------------------------------------------
  describe('(b) o prestador se cadastra e é aprovado por um admin', () => {
    it('become_provider cria o rascunho, segura o endereço da página e muda o papel', async () => {
      providerSlug = await registerProvider(world, provider, {
        occupation: policy.occupation_slug,
        neighborhood: hood.id,
      });

      const row = must(await provider.client.from('providers').select('status, slug').eq('id', provider.id).single(), 'prestador');
      expect(row).toMatchObject({ status: 'draft', slug: providerSlug });

      const occupation = must(
        await provider.client.from('provider_occupations').select('approved, is_primary, registry_status').eq('provider_id', provider.id).single(),
        'ocupação do prestador',
      );
      expect(occupation).toMatchObject({ approved: false, is_primary: true, registry_status: 'not_required' });

      const profile = must(await provider.client.from('profiles').select('role').eq('id', provider.id).single(), 'perfil');
      expect(profile.role).toBe('provider');

      expect(must(await world.anon.rpc('slug_available', { p_slug: providerSlug }), 'slug_available')).toBe(false);
      expect(must(await world.anon.rpc('slug_available', { p_slug: world.unique('livre') }), 'slug_available')).toBe(true);
      // quem já é prestador não vira prestador de novo
      await expectRule(
        provider.client.rpc('become_provider', { p_display_name: 'Outra vez', p_slug: world.unique('de-novo'), p_occupation: policy.occupation_slug }),
        'not_allowed',
      );
    });

    it('sem os documentos que a política exige, o cadastro não entra em análise', async () => {
      if (policy.verification.length === 0) return; // política sem exigência: nada a faltar
      const error = await expectRule(provider.client.rpc('submit_provider_for_review'), 'documents_missing');
      for (const step of policy.verification) expect(error.details).toContain(step);

      // Um registro sem arquivo no bucket não conta como documento enviado.
      const [first] = policy.verification;
      const ghost = must(
        await provider.client
          .from('provider_documents')
          .insert({ provider_id: provider.id, step: first, storage_path: `${provider.id}/sem-arquivo.pdf` })
          .select('id')
          .single(),
        'documento sem arquivo',
      );
      await expectRule(provider.client.rpc('submit_provider_for_review'), 'documents_missing');
      must(await provider.client.from('provider_documents').delete().eq('id', ghost.id).select('id'), 'apaga o registro sem arquivo');
    });

    it('envia os documentos exigidos, ninguém os lê e o dono não os aceita sozinho', async () => {
      providerDocuments = [];
      for (const step of policy.verification) providerDocuments.push(await submitDocument(world, provider, step));

      for (const document of providerDocuments) {
        const row = must(await provider.client.from('provider_documents').select('status').eq('id', document.id).single(), 'documento');
        expect(row.status).toBe('submitted');
      }
      if (providerDocuments.length > 0) {
        // o dono não decide: não há grant de UPDATE, e a revisão é do admin
        await expectDenied(
          provider.client.from('provider_documents').update({ status: 'accepted' }).eq('id', providerDocuments[0].id),
        );
        // outro cliente não lê a linha nem o arquivo
        expect(visibleIds(await client2.client.from('provider_documents').select('id'))).toEqual([]);
        const stolen = await client2.client.storage.from(DOCUMENTS_BUCKET).download(providerDocuments[0].path);
        expect(stolen.error).not.toBeNull();
      }

      // o dono também não muda o próprio status, nem a aprovação da ocupação
      await expectRule(provider.client.from('providers').update({ status: 'approved' }).eq('id', provider.id), 'not_allowed');
      await expectRule(
        provider.client.from('provider_occupations').update({ approved: true }).eq('provider_id', provider.id),
        'not_allowed',
      );
    });

    it('entra em análise (pending_review)', async () => {
      const status = must(await provider.client.rpc('submit_provider_for_review'), 'submit_provider_for_review');
      expect(status).toBe('pending_review');
      const row = must(await provider.client.from('providers').select('status').eq('id', provider.id).single(), 'prestador');
      expect(row.status).toBe('pending_review');
    });

    it('antes da aprovação o prestador não vê pedidos, não propõe e não aparece na busca', async () => {
      const mine = must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me');
      expect(mine).toEqual([]);

      await expectRule(provider.client.from('proposals').insert({ request_id: requestId, price_cents: 15000 }), 'not_allowed');

      const found = must(
        await world.anon.rpc('search_providers', { p_occupation: policy.occupation_slug, p_neighborhood: hood.id }),
        'search_providers',
      );
      expect(found.map(row => row.provider_id)).not.toContain(provider.id);
      const page = await world.anon.rpc('get_provider_page', { p_slug: providerSlug });
      expect(page.error).toBeNull();
      expect(page.data).toBeNull();
    });

    it('o admin só aprova a ocupação depois de aceitar os documentos', async () => {
      // quem não é admin não revisa nada
      if (providerDocuments.length > 0) {
        await expectRule(client.client.rpc('admin_review_document', { p_document: providerDocuments[0].id, p_accept: true }), 'not_allowed');
        await expectRule(
          admin.client.rpc('admin_set_occupation_approval', { p_provider: provider.id, p_occupation: policy.occupation_slug, p_approved: true }),
          'documents_missing',
        );
      }

      for (const document of providerDocuments) {
        expect(must(await admin.client.rpc('admin_review_document', { p_document: document.id, p_accept: true }), 'aceite')).toBe('accepted');
      }
      must(
        await admin.client.rpc('admin_set_occupation_approval', {
          p_provider: provider.id,
          p_occupation: policy.occupation_slug,
          p_approved: true,
          p_reason: 'teste de integração',
        }),
        'aprovação da ocupação',
      );
      expect(must(await admin.client.rpc('admin_set_provider_status', { p_provider: provider.id, p_status: 'approved' }), 'aprovação')).toBe('approved');

      const occupation = must(
        await provider.client.from('provider_occupations').select('approved').eq('provider_id', provider.id).single(),
        'ocupação aprovada',
      );
      expect(occupation.approved).toBe(true);

      // a decisão fica na trilha de auditoria, que só o admin lê
      const audit = must(
        await admin.client.from('audit_log').select('action').eq('entity_id', provider.id).eq('action', 'provider.status'),
        'audit_log',
      );
      expect(audit.length).toBeGreaterThan(0);
      expect(visibleIds(await client.client.from('audit_log').select('id'))).toEqual([]);
    });

    it('depois de aprovado aparece na busca pública e tem página própria', async () => {
      const found = must(
        await world.anon.rpc('search_providers', { p_occupation: policy.occupation_slug, p_neighborhood: hood.id }),
        'search_providers',
      );
      expect(found.map(row => row.provider_id)).toContain(provider.id);

      const page = must(await world.anon.rpc('get_provider_page', { p_slug: providerSlug }), 'get_provider_page') as {
        provider: { id: string };
        occupations: Array<{ slug: string }>;
      };
      expect(page.provider.id).toBe(provider.id);
      expect(page.occupations.map(o => o.slug)).toContain(policy.occupation_slug);
      // a página pública não traz contato nenhum
      expect(JSON.stringify(page)).not.toMatch(/phone|telefone|email/i);
    });

    it('outros prestadores da mesma ocupação são aprovados pelo mesmo caminho', async () => {
      // um a mais que o limite: o último é quem tenta propor depois do limite e faz de "outro prestador"
      extras = [];
      for (let i = 0; i < limit; i++) {
        extras.push(await makeApprovedProvider(world, admin, { label: `prestador-${i + 2}`, policy, neighborhood: hood.id }));
      }
      outsider = extras[extras.length - 1].user;
      expect(extras).toHaveLength(limit);
    });
  });

  // -------------------------------------------------------------------------
  // (c) pedidos abertos para o prestador, propostas e limite
  // -------------------------------------------------------------------------
  describe('(c) o prestador aprovado vê o pedido e envia proposta', () => {
    it('open_requests_for_me mostra o pedido sem telefone nem e-mail do cliente', async () => {
      const rows = must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me');
      const row = rows.find(r => r.id === requestId);
      expect(row, 'o pedido do cliente deve aparecer para o prestador aprovado').toBeDefined();
      expect(Object.keys(row ?? {}).sort()).toEqual(OPEN_REQUEST_COLUMNS);
      expect(row).toMatchObject({ occupation_slug: policy.occupation_slug, neighborhood_id: hood.id, proposal_count: 0, my_proposal_id: null });

      const text = JSON.stringify(rows);
      expect(text).not.toContain(CLIENT_PHONE);
      expect(text).not.toContain(client.email);
      expect(text).not.toContain(client.id);

      // e quem não é prestador não recebe pedido nenhum
      expect(must(await client2.client.rpc('open_requests_for_me'), 'open_requests_for_me')).toEqual([]);
    });

    it('envia a proposta; repetir ou propor valor inválido é recusado', async () => {
      const created = must(
        await provider.client
          .from('proposals')
          .insert({ request_id: requestId, price_cents: 18000, message: 'Posso ir na segunda, das 9h às 12h.' })
          .select('id, status, provider_id')
          .single(),
        'proposta',
      );
      proposalId = created.id;
      expect(created).toMatchObject({ status: 'sent', provider_id: provider.id });

      const again = await provider.client.from('proposals').insert({ request_id: requestId, price_cents: 17000 });
      expect(again.error?.code).toBe('23505');
      const free = await provider.client.from('proposals').insert({ request_id: requestId, price_cents: 0 });
      expect(free.error?.code).toBe('23514');

      const mine = must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me').find(r => r.id === requestId);
      expect(mine).toMatchObject({ proposal_count: 1, my_proposal_id: proposalId, my_proposal_status: 'sent' });
    });

    it('respeita proposal_limit: passado o limite, a proposta seguinte é recusada', async () => {
      // P1 já ocupa uma vaga; os próximos ocupam as restantes, menos o último, que fica de fora
      for (const extra of extras.slice(0, limit - 1)) {
        must(
          await extra.user.client.from('proposals').insert({ request_id: requestId, price_cents: 20000 }).select('id').single(),
          'proposta dentro do limite',
        );
      }
      await expectRule(outsider.client.from('proposals').insert({ request_id: requestId, price_cents: 19000 }), 'proposal_limit');

      // o cliente vê exatamente `limit` propostas, e nada do prestador que ficou de fora
      const received = must(await client.client.from('proposals').select('id, provider_id, status').eq('request_id', requestId), 'propostas recebidas');
      expect(received).toHaveLength(limit);
      expect(received.map(p => p.provider_id)).not.toContain(outsider.id);

      // proposta é anônima para os concorrentes: cada prestador lê só as próprias
      const others = visibleIds(await provider.client.from('proposals').select('id'));
      expect(others).toEqual([proposalId]);
    });

    it('receber proposta não entrega o telefone do prestador ao cliente', async () => {
      const ids = [provider.id, ...extras.map(e => e.user.id)];
      const profiles = must(await client.client.from('profiles').select('id').in('id', ids), 'perfis');
      expect(profiles).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // (d) o cliente aceita e nasce o atendimento
  // -------------------------------------------------------------------------
  describe('(d) o cliente aceita a proposta e nasce o atendimento', () => {
    it('só o dono do pedido aceita, e o período precisa ser futuro e de até 24 h', async () => {
      const ok = spRange(monday, '09:00', '12:00');
      await expectRule(accept(client2, proposalId, ok), 'not_allowed');
      await expectRule(accept(provider, proposalId, ok), 'not_allowed');
      await expectDenied(world.anon.rpc('accept_proposal', { p_proposal: proposalId, p_period: ok }));

      await expectRule(accept(client, proposalId, spRange(addDays(spToday(), -1), '09:00', '12:00')), 'slot_unavailable');
      await expectRule(
        accept(client, proposalId, `[${new Date(`${monday}T09:00:00-03:00`).toISOString()},${new Date(`${tuesday}T12:00:00-03:00`).toISOString()})`),
        'slot_unavailable',
      );
    });

    it('accept_proposal cria o atendimento, casa o pedido e recusa as outras propostas', async () => {
      const id = must(await accept(client, proposalId, spRange(monday, '09:00', '12:00')), 'accept_proposal');
      bookingId = id;
      world.track('bookings', id);
      flowBookingIds.push(id);

      const booking = must(
        await client.client
          .from('bookings')
          .select('client_id, provider_id, occupation_slug, status, origin, price_cents, platform_fee_cents, request_id, proposal_id, period')
          .eq('id', id)
          .single(),
        'atendimento',
      );
      expect(booking).toMatchObject({
        client_id: client.id,
        provider_id: provider.id,
        occupation_slug: policy.occupation_slug,
        status: 'accepted',
        origin: 'platform',
        price_cents: 18000,
        platform_fee_cents: 0, // comissão desligada
        request_id: requestId,
        proposal_id: proposalId,
      });
      const period = parseTstzRange(booking.period as string);
      expect(period?.start.toISOString()).toBe(new Date(`${monday}T09:00:00-03:00`).toISOString());

      const request = must(await client.client.from('requests').select('status').eq('id', requestId).single(), 'pedido');
      expect(request.status).toBe('matched');
      const proposals = must(await client.client.from('proposals').select('provider_id, status').eq('request_id', requestId), 'propostas');
      expect(proposals.find(p => p.provider_id === provider.id)?.status).toBe('accepted');
      expect(proposals.filter(p => p.provider_id !== provider.id).every(p => p.status === 'declined')).toBe(true);

      // o pedido casado sai da lista de quem estava concorrendo
      const stillOpen = must(await extras[0].user.client.rpc('open_requests_for_me'), 'open_requests_for_me');
      expect(stillOpen.map(r => r.id)).not.toContain(requestId);

      // aceitar de novo não gera um segundo atendimento
      await expectRule(accept(client, proposalId, spRange(monday, '13:00', '15:00')), 'request_not_open');
    });

    it('depois do aceite o prestador entra na agenda do cliente e vê quem pediu', async () => {
      const entry = must(await provider.client.from('provider_clients').select('name, origin, phone'), 'CRM do prestador');
      expect(entry).toHaveLength(1);
      expect(entry[0]).toMatchObject({ origin: 'platform' });

      // o prestador do atendimento lê o perfil do cliente que pediu; o inverso vale depois do aceite
      const seenByProvider = must(await provider.client.from('profiles').select('id, phone').eq('id', client.id), 'perfil do cliente');
      expect(seenByProvider).toEqual([{ id: client.id, phone: CLIENT_PHONE }]);
      const seenByClient = must(await client.client.from('profiles').select('id').eq('id', provider.id), 'perfil do prestador');
      expect(seenByClient).toHaveLength(1);

      // quem perdeu a disputa não vê o cliente nem o atendimento
      const loser = extras[0].user;
      expect(visibleIds(await loser.client.from('profiles').select('id').eq('id', client.id))).toEqual([]);
      expect(visibleIds(await loser.client.from('bookings').select('id'))).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // (e) trava trabalhista
  // -------------------------------------------------------------------------
  describe('(e) trava trabalhista na semana ISO de São Paulo', () => {
    it('o segundo dia da semana passa', async () => {
      const second = await askAndPropose(client, provider, 'Segunda diária da semana');
      tuesdayBookingId = must(await accept(client, second.proposalId, spRange(tuesday, '09:00', '12:00')), 'segundo dia');
      world.track('bookings', tuesdayBookingId);
      flowBookingIds.push(tuesdayBookingId);
    });

    it('o terceiro dia da mesma semana falha com labor_lock, inclusive no domingo à noite', async () => {
      const third = await askAndPropose(client, provider, 'Terceira diária na mesma semana');
      await expectRule(accept(client, third.proposalId, spRange(wednesday, '09:00', '12:00')), 'labor_lock');

      // domingo 22h-23h em São Paulo já é segunda-feira em UTC: a semana é a de São Paulo
      const night = await askAndPropose(client, provider, 'Diária no domingo à noite');
      await expectRule(accept(client, night.proposalId, spRange(sunday, '22:00', '23:00')), 'labor_lock');

      // a recusa desfaz tudo: a proposta continua enviada e o pedido aberto
      const state = must(await client.client.from('proposals').select('status').eq('id', third.proposalId).single(), 'proposta');
      expect(state.status).toBe('sent');
      const request = must(await client.client.from('requests').select('status').eq('id', third.requestId).single(), 'pedido');
      expect(request.status).toBe('open');

      // o cliente cancela os pedidos que não vai levar adiante
      for (const id of [third.requestId, night.requestId]) {
        must(await client.client.from('requests').update({ status: 'canceled' }).eq('id', id).select('id'), 'cancelar pedido');
      }
    });

    it('na semana seguinte o mesmo prestador volta a poder atender o mesmo cliente', async () => {
      const next = await askAndPropose(client, provider, 'Diária da semana seguinte');
      const id = must(await accept(client, next.proposalId, spRange(nextMonday, '09:00', '12:00')), 'semana seguinte');
      world.track('bookings', id);
      flowBookingIds.push(id);
      const booking = must(await client.client.from('bookings').select('status').eq('id', id).single(), 'atendimento');
      expect(booking.status).toBe('accepted');
    });
  });

  // -------------------------------------------------------------------------
  // (f) pagamento (como o webhook), conclusão, liberação e avaliação
  // -------------------------------------------------------------------------
  describe('(f) pagamento, conclusão, liberação e avaliação', () => {
    it('ninguém marca o atendimento como pago pela API do app', async () => {
      await expectRule(client.client.from('bookings').update({ status: 'paid' }).eq('id', bookingId), 'not_allowed');
      await expectRule(client.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'paid' }), 'invalid_transition');
      await expectRule(provider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'paid' }), 'invalid_transition');
      await expectRule(provider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'released' }), 'invalid_transition');
    });

    it('a avaliação antes do pagamento é recusada', async () => {
      await expectRule(
        client.client.from('reviews').insert({ booking_id: bookingId, rating: 5, comment: 'Cedo demais' }),
        'review_not_allowed',
      );
    });

    it('o webhook registra o pagamento e leva o atendimento a "paid"', async () => {
      const inserted = must(
        await world.service
          .from('payments')
          .insert({
            booking_id: bookingId,
            provider_id: provider.id,
            payer_id: client.id,
            asaas_payment_id: `it_${world.runId}_pay`,
            method: 'pix',
            amount_cents: 18000,
            platform_fee_cents: 0,
            status: 'pending',
            invoice_url: 'https://example.invalid/fatura/teste',
            raw: { id: `it_${world.runId}_pay`, status: 'PENDING', value: 180, billingType: 'PIX', customerName: 'Cliente de Teste', cpfCnpj: '00000000000' },
          })
          .select('id')
          .single(),
        'pagamento pendente',
      );
      paymentId = inserted.id;
      world.track('payments', paymentId);

      // PAYMENT_RECEIVED: o pagamento é confirmado e o atendimento passa a "paid"
      must(await world.service.from('payments').update({ status: 'received' }).eq('id', paymentId).select('id'), 'pagamento recebido');
      expect(must(await world.service.rpc('transition_booking', { p_booking: bookingId, p_to: 'paid' }), 'transition_booking')).toBe('paid');

      const booking = must(await client.client.from('bookings').select('status').eq('id', bookingId).single(), 'atendimento');
      expect(booking.status).toBe('paid');
    });

    it('pago mas ainda não concluído, o atendimento também não pode ser avaliado', async () => {
      await expectRule(client.client.from('reviews').insert({ booking_id: bookingId, rating: 5 }), 'review_not_allowed');
    });

    it('o prestador conclui e o cliente libera', async () => {
      await expectRule(client.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'completed' }), 'invalid_transition');
      expect(must(await provider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'in_progress' }), 'iniciar')).toBe('in_progress');
      expect(must(await provider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'completed' }), 'concluir')).toBe('completed');
      // liberar é do cliente; o prestador não se libera sozinho
      await expectRule(provider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'released' }), 'invalid_transition');
      expect(must(await client.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'released', p_reason: 'serviço feito' }), 'liberar')).toBe('released');

      const events = must(
        await client.client.from('booking_events').select('from_status, to_status').eq('booking_id', bookingId).order('at').order('created_at'),
        'histórico',
      );
      expect(events.map(e => e.to_status)).toEqual(['accepted', 'paid', 'in_progress', 'completed', 'released']);
    });

    it('só então o cliente avalia, uma vez, e a publicação segue a política da ocupação', async () => {
      const review = must(
        await client.client
          .from('reviews')
          .insert({ booking_id: bookingId, rating: 5, comment: 'Tudo certo, recomendo (teste)' })
          .select('id, published, provider_id, client_id')
          .single(),
        'avaliação',
      );
      reviewId = review.id;
      expect(review).toMatchObject({ provider_id: provider.id, client_id: client.id, published: policy.rating_ranking });

      const twice = await client.client.from('reviews').insert({ booking_id: bookingId, rating: 1 });
      expect(twice.error?.code).toBe('23505');

      // o prestador lê a avaliação; o autor não a publica nem a esconde por conta própria
      expect(visibleIds(await provider.client.from('reviews').select('id'))).toEqual([reviewId]);
      await expectRule(client.client.from('reviews').update({ published: !policy.rating_ranking }).eq('id', reviewId), 'not_allowed');

      const page = must(await world.anon.rpc('get_provider_page', { p_slug: providerSlug }), 'get_provider_page') as {
        reviews: Array<{ rating: number }>;
      };
      expect(page.reviews).toHaveLength(policy.rating_ranking ? 1 : 0);
    });

    it('concluído sem pagamento no app, o atendimento não pode ser avaliado', async () => {
      expect(must(await provider.client.rpc('transition_booking', { p_booking: tuesdayBookingId, p_to: 'in_progress' }), 'iniciar')).toBe('in_progress');
      expect(must(await provider.client.rpc('transition_booking', { p_booking: tuesdayBookingId, p_to: 'completed' }), 'concluir')).toBe('completed');
      await expectRule(client.client.from('reviews').insert({ booking_id: tuesdayBookingId, rating: 5 }), 'review_not_allowed');
    });

    it('terminar o atendimento não libera um terceiro dia na semana', async () => {
      const again = await askAndPropose(client, provider, 'Quarta, depois de concluir os outros');
      await expectRule(accept(client, again.proposalId, spRange(wednesday, '09:00', '12:00')), 'labor_lock');
      must(await client.client.from('requests').update({ status: 'canceled' }).eq('id', again.requestId).select('id'), 'cancelar pedido');
    });

    it('cliente e prestador leem o pagamento sem o payload do gateway', async () => {
      const columns = 'id, booking_id, amount_cents, status, payer_id, provider_id';
      for (const user of [client, provider]) {
        const rows = must(await user.client.from('payments').select(columns).eq('id', paymentId), 'pagamento');
        expect(rows).toEqual([
          { id: paymentId, booking_id: bookingId, amount_cents: 18000, status: 'received', payer_id: client.id, provider_id: provider.id },
        ]);
      }
      // `select *` inclui `raw` (dados fiscais do pagador): negado
      await expectDenied(client.client.from('payments').select('*').eq('id', paymentId));
      await expectDenied(provider.client.from('payments').select('raw').eq('id', paymentId));
    });
  });

  // -------------------------------------------------------------------------
  // (g) vazamento: quem não participa não lê nada do fluxo
  // -------------------------------------------------------------------------
  describe('(g) outro cliente, outro prestador e anônimo não leem nada do fluxo', () => {
    const readers = (): Array<{ label: string; db: TestUser['client'] }> => [
      { label: 'outro cliente', db: client2.client },
      { label: 'outro prestador', db: outsider.client },
      { label: 'anônimo', db: world.anon },
    ];

    it('as tabelas do fluxo voltam vazias ou negadas', async () => {
      const flowUsers = [client.id, provider.id];
      for (const { label, db } of readers()) {
        const check = (what: string, ids: string[], forbidden: string[]) => {
          for (const id of forbidden) expect(ids, `${label} leu ${what}`).not.toContain(id);
        };
        check('bookings', visibleIds(await db.from('bookings').select('id')), flowBookingIds);
        check('payments', visibleIds(await db.from('payments').select('id')), [paymentId]);
        check('requests', visibleIds(await db.from('requests').select('id')), [requestId]);
        check('proposals', visibleIds(await db.from('proposals').select('id')), [proposalId]);
        check('reviews', visibleIds(await db.from('reviews').select('id')), [reviewId]);
        check('profiles', visibleIds(await db.from('profiles').select('id')), flowUsers);
        check('providers', visibleIds(await db.from('providers').select('id')), [provider.id]);
        check('provider_documents', visibleIds(await db.from('provider_documents').select('id')), providerDocuments.map(d => d.id));
      }
      // histórico de status e CRM só existem para quem participa
      for (const { db } of readers()) {
        expect(visibleIds(await db.from('booking_events').select('id'))).toEqual([]);
        expect(visibleIds(await db.from('provider_clients').select('id'))).toEqual([]);
      }
      // quem tem conta lê o próprio perfil e nada além dele
      expect(visibleIds(await client2.client.from('profiles').select('id'))).toEqual([client2.id]);
    });

    it('nem por filtro direto, RPC ou arquivo', async () => {
      for (const { label, db } of readers()) {
        const byId = await db.from('bookings').select('id').eq('id', bookingId);
        expect(visibleIds(byId), label).toEqual([]);
        const profile = await db.from('profiles').select('id, phone').eq('id', client.id);
        expect(visibleIds(profile), label).toEqual([]);
      }
      await expectRule(client2.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'disputed' }), 'not_allowed');
      await expectRule(outsider.client.rpc('transition_booking', { p_booking: bookingId, p_to: 'in_progress' }), 'not_allowed');
      await expectDenied(world.anon.rpc('transition_booking', { p_booking: bookingId, p_to: 'disputed' }));
      await expectDenied(world.anon.rpc('open_requests_for_me'));

      if (providerDocuments.length > 0) {
        const path = providerDocuments[0].path;
        for (const db of [client2.client, outsider.client, world.anon]) {
          expect((await db.storage.from(DOCUMENTS_BUCKET).download(path)).error).not.toBeNull();
        }
        // o outro prestador também não escreve na pasta de ninguém
        const forged = await outsider.client.storage
          .from(DOCUMENTS_BUCKET)
          .upload(`${provider.id}/intruso.pdf`, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' });
        expect(forged.error).not.toBeNull();
        // o dono e o admin leem
        expect((await provider.client.storage.from(DOCUMENTS_BUCKET).download(path)).error).toBeNull();
        expect((await admin.client.storage.from(DOCUMENTS_BUCKET).download(path)).error).toBeNull();
      }
    });

    it('e os participantes (e o admin) de fato leem o que é deles', async () => {
      expect(visibleIds(await client.client.from('bookings').select('id'))).toEqual(expect.arrayContaining(flowBookingIds));
      expect(visibleIds(await provider.client.from('bookings').select('id'))).toEqual(expect.arrayContaining(flowBookingIds));
      expect(visibleIds(await client.client.from('requests').select('id'))).toContain(requestId);
      expect(visibleIds(await admin.client.from('bookings').select('id'))).toEqual(expect.arrayContaining(flowBookingIds));
      expect(visibleIds(await admin.client.from('payments').select('id'))).toContain(paymentId);
    });
  });

  // -------------------------------------------------------------------------
  // trava por empregador: outro cliente contrata o mesmo prestador na mesma semana
  // -------------------------------------------------------------------------
  describe('a trava vale por empregador', () => {
    it('outro cliente contrata o mesmo prestador no terceiro dia da semana sem ser barrado', async () => {
      const other = await askAndPropose(client2, provider, 'Diária de outro cliente');
      const id = must(await accept(client2, other.proposalId, spRange(wednesday, '09:00', '12:00')), 'outro empregador');
      world.track('bookings', id);
      // e a segunda diária do outro cliente com o mesmo prestador ainda cabe; a terceira não
      const second = await askAndPropose(client2, provider, 'Segunda diária do outro cliente');
      world.track('bookings', must(await accept(client2, second.proposalId, spRange(addDays(monday, 3), '09:00', '12:00')), 'segundo dia'));
      const third = await askAndPropose(client2, provider, 'Terceira diária do outro cliente');
      await expectRule(accept(client2, third.proposalId, spRange(addDays(monday, 4), '09:00', '12:00')), 'labor_lock');
      must(await client2.client.from('requests').update({ status: 'canceled' }).eq('id', third.requestId).select('id'), 'cancelar pedido');
    });
  });

  // -------------------------------------------------------------------------
  // (h) orçamento público
  // -------------------------------------------------------------------------
  describe('(h) orçamento público por token', () => {
    let token = '';
    let quoteId = '';

    it('o prestador cria o orçamento e o total é calculado no servidor', async () => {
      const quote = must(
        await provider.client
          .from('quotes')
          .insert({
            title: 'Limpeza pós-obra',
            client_name: 'Cliente Convidado',
            client_phone: '11911112222',
            items: [
              { description: 'Diária', quantity: 2, unit_price_cents: 15000 },
              { description: 'Material', quantity: 1, unit_price_cents: 4990 },
            ],
            valid_until: addDays(spToday(), 7),
            status: 'sent',
          })
          .select('id, public_token, total_cents, status')
          .single(),
        'orçamento',
      );
      quoteId = quote.id;
      token = quote.public_token;
      expect(quote).toMatchObject({ total_cents: 34990, status: 'sent' });

      const invalid = await provider.client.from('quotes').insert({
        title: 'Itens inválidos',
        items: [{ description: 'Sem preço', quantity: 1 }],
        status: 'draft',
      });
      expect(invalid.error?.message).toBe('quote_items_invalid');
    });

    it('anônimo abre pelo token, sem telefone, e rascunho não abre', async () => {
      const opened = must(await world.anon.rpc('get_quote_by_token', { p_token: token }), 'get_quote_by_token') as Record<string, unknown>;
      expect(opened).toMatchObject({ id: quoteId, title: 'Limpeza pós-obra', total_cents: 34990, status: 'sent' });
      expect((opened.provider as { display_name: string }).display_name).toContain('Prestador');
      expect(JSON.stringify(opened)).not.toContain('11911112222');

      const draft = must(
        await provider.client
          .from('quotes')
          .insert({ title: 'Ainda em rascunho', items: [], status: 'draft' })
          .select('public_token')
          .single(),
        'rascunho',
      );
      expect((await world.anon.rpc('get_quote_by_token', { p_token: draft.public_token })).data).toBeNull();
      await expectRule(world.anon.rpc('respond_quote', { p_token: draft.public_token, p_accept: true }), 'not_allowed');

      // anônimo e outros usuários não leem a tabela de orçamentos
      expect(visibleIds(await world.anon.from('quotes').select('id'))).toEqual([]);
      expect(visibleIds(await client2.client.from('quotes').select('id'))).toEqual([]);
    });

    it('anônimo aceita uma vez, e o prestador vê o novo status', async () => {
      expect(must(await world.anon.rpc('respond_quote', { p_token: token, p_accept: true }), 'respond_quote')).toBe('accepted');
      await expectRule(world.anon.rpc('respond_quote', { p_token: token, p_accept: false }), 'invalid_transition');

      const seen = must(await provider.client.from('quotes').select('status').eq('id', quoteId).single(), 'orçamento');
      expect(seen.status).toBe('accepted');
      const reopened = must(await world.anon.rpc('get_quote_by_token', { p_token: token }), 'get_quote_by_token') as { status: string };
      expect(reopened.status).toBe('accepted');
      // o prestador não reabre uma decisão do cliente
      await expectRule(provider.client.from('quotes').update({ status: 'draft' }).eq('id', quoteId), 'invalid_transition');
    });

    it('orçamento vencido aparece como expirado e não aceita resposta', async () => {
      const old = must(
        await provider.client
          .from('quotes')
          .insert({ title: 'Orçamento vencido', items: [], valid_until: addDays(spToday(), -2), status: 'sent' })
          .select('public_token')
          .single(),
        'orçamento vencido',
      );
      const opened = must(await world.anon.rpc('get_quote_by_token', { p_token: old.public_token }), 'get_quote_by_token') as { status: string };
      expect(opened.status).toBe('expired');
      await expectRule(world.anon.rpc('respond_quote', { p_token: old.public_token, p_accept: true }), 'quote_expired');
    });
  });

  // -------------------------------------------------------------------------
  // (i) LGPD: pedido de exportação e exclusão, anonimização preserva o financeiro
  // -------------------------------------------------------------------------
  describe('(i) LGPD: pedidos do titular e anonimização', () => {
    it('registra consentimento e pedidos de exportação e exclusão, sem poder forjar o andamento', async () => {
      const consent = must(
        await client.client.from('consents').insert({ purpose: 'privacy', version: 'teste-1', granted: true }).select('id, user_id, granted').single(),
        'consentimento',
      );
      expect(consent).toMatchObject({ user_id: client.id, granted: true });
      // o histórico não se reescreve
      await expectDenied(client.client.from('consents').update({ granted: false }).eq('id', consent.id));

      const exportRequest = must(
        await client.client.from('data_requests').insert({ kind: 'export' }).select('id, status, user_id, kind').single(),
        'pedido de exportação',
      );
      world.track('data_requests', exportRequest.id);
      expect(exportRequest).toMatchObject({ status: 'pending', user_id: client.id, kind: 'export' });

      const deleteRequest = must(
        await client.client.from('data_requests').insert({ kind: 'delete' }).select('id, status').single(),
        'pedido de exclusão',
      );
      world.track('data_requests', deleteRequest.id);
      expect(deleteRequest.status).toBe('pending');

      // o titular só informa o tipo: status, conclusão e resultado são do servidor
      await expectDenied(client.client.from('data_requests').insert({ kind: 'export', status: 'completed' }));
      await expectDenied(client.client.from('data_requests').update({ status: 'completed' }).eq('id', exportRequest.id));

      // cada um lê só os próprios pedidos
      expect(visibleIds(await client.client.from('data_requests').select('id'))).toEqual(
        expect.arrayContaining([exportRequest.id, deleteRequest.id]),
      );
      expect(visibleIds(await client2.client.from('data_requests').select('id'))).toEqual([]);

      // o servidor atende a exportação (a Edge Function faz isto)
      must(
        await world.service
          .from('data_requests')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', exportRequest.id)
          .select('id'),
        'exportação concluída',
      );
      const done = must(await client.client.from('data_requests').select('status').eq('id', exportRequest.id).single(), 'pedido');
      expect(done.status).toBe('completed');
    });

    it('anonymize_user é só da chave de serviço', async () => {
      await expectDenied(client.client.rpc('anonymize_user', { p_user: client.id }));
      await expectDenied(world.anon.rpc('anonymize_user', { p_user: client.id }));
      await expectRule(world.service.rpc('anonymize_user', { p_user: '00000000-0000-4000-8000-000000000000' }), 'not_allowed');
    });

    it('anonimizar o cliente apaga os dados pessoais e preserva atendimento, pagamento e avaliação', async () => {
      const { error } = await world.service.rpc('anonymize_user', { p_user: client.id });
      expect(error).toBeNull();

      const profile = must(await world.service.from('profiles').select('full_name, phone, deleted_at').eq('id', client.id).single(), 'perfil');
      expect(profile.full_name).toBeNull();
      expect(profile.phone).toBeNull();
      expect(profile.deleted_at).not.toBeNull();

      const request = must(await world.service.from('requests').select('description, preferred_dates').eq('id', requestId).single(), 'pedido');
      expect(request.description).toBe('Pedido removido a pedido do titular.');
      expect(request.preferred_dates).toBeNull();

      const crm = must(await world.service.from('provider_clients').select('name, phone').eq('client_id', client.id), 'CRM');
      expect(crm.every(row => row.name === 'Cliente removido' && row.phone === null)).toBe(true);

      // financeiro e histórico ficam
      const booking = must(await world.service.from('bookings').select('status, price_cents, client_id').eq('id', bookingId).single(), 'atendimento');
      expect(booking).toMatchObject({ status: 'released', price_cents: 18000, client_id: client.id });
      const payment = must(
        await world.service.from('payments').select('amount_cents, status, invoice_url, raw').eq('id', paymentId).single(),
        'pagamento',
      );
      expect(payment).toMatchObject({ amount_cents: 18000, status: 'received', invoice_url: null });
      // do payload do gateway ficam só os campos fiscais, sem nome nem documento do pagador
      expect(Object.keys(payment.raw as Record<string, unknown>).sort()).toEqual(['billingType', 'id', 'status', 'value']);
      const review = must(await world.service.from('reviews').select('rating, comment').eq('id', reviewId).single(), 'avaliação');
      expect(review).toEqual({ rating: 5, comment: null });

      const trail = must(await world.service.from('audit_log').select('action').eq('entity_id', client.id).eq('action', 'user.anonymized'), 'auditoria');
      expect(trail.length).toBeGreaterThan(0);
    });

    it('apagar a conta do Auth mantém o registro financeiro, sem o titular', async () => {
      const { error } = await world.service.auth.admin.deleteUser(client.id);
      expect(error).toBeNull();

      const booking = must(await world.service.from('bookings').select('client_id, status, price_cents').eq('id', bookingId).single(), 'atendimento');
      expect(booking).toEqual({ client_id: null, status: 'released', price_cents: 18000 });
      const payment = must(await world.service.from('payments').select('payer_id, amount_cents, status').eq('id', paymentId).single(), 'pagamento');
      expect(payment).toEqual({ payer_id: null, amount_cents: 18000, status: 'received' });
      expect(visibleIds(await world.service.from('requests').select('id').eq('id', requestId))).toEqual([]); // pedido sai junto (cascata)
    });

    it('anonimizar o prestador exige esvaziar os documentos e some da busca, mantendo o recebido', async () => {
      if (providerDocuments.length > 0) {
        await expectRule(world.service.rpc('anonymize_user', { p_user: provider.id }), 'storage_not_empty');
        const removed = await world.service.storage.from(DOCUMENTS_BUCKET).remove(providerDocuments.map(d => d.path));
        expect(removed.error).toBeNull();
      }
      const { error } = await world.service.rpc('anonymize_user', { p_user: provider.id });
      expect(error).toBeNull();

      const row = must(await world.service.from('providers').select('display_name, status, bio').eq('id', provider.id).single(), 'prestador');
      expect(row).toMatchObject({ display_name: 'Prestador removido', status: 'suspended', bio: null });
      expect(visibleIds(await world.service.from('provider_documents').select('id').eq('provider_id', provider.id))).toEqual([]);

      const found = must(
        await world.anon.rpc('search_providers', { p_occupation: policy.occupation_slug, p_neighborhood: hood.id }),
        'search_providers',
      );
      expect(found.map(r => r.provider_id)).not.toContain(provider.id);

      const quote = must(await world.service.from('quotes').select('client_name, client_phone, total_cents').eq('provider_id', provider.id).eq('title', 'Limpeza pós-obra').single(), 'orçamento');
      expect(quote).toEqual({ client_name: null, client_phone: null, total_cents: 34990 });
      const payment = must(await world.service.from('payments').select('amount_cents, provider_id').eq('id', paymentId).single(), 'pagamento');
      expect(payment).toEqual({ amount_cents: 18000, provider_id: provider.id });
    });
  });
});
