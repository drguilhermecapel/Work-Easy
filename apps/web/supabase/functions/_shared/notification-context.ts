// notifications.params is written by the database triggers (08_notifications.sql)
// and does not carry every value a template needs: the occupation's name, the
// other party's name, the payer's name and the neighborhood are looked up here,
// by the ids the triggers do store (booking_id, request_id, payment_id, shift_id).
// The lookups go through a minimal interface so they can be tested without a database.

export interface LookupDb {
  /** One row of `table` where `column = value`, or null. Rejects on a database failure (the dispatcher retries it). */
  one(table: string, select: string, column: string, value: string): Promise<Record<string, unknown> | null>;
}

export interface ContextRow {
  template: string;
  user_id: string | null;
  params: unknown;
}

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function occupationName(db: LookupDb, slug: string | null): Promise<string | null> {
  if (!slug) return null;
  return text((await db.one('occupations', 'name', 'slug', slug))?.name);
}

async function profileName(db: LookupDb, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return text((await db.one('profiles', 'full_name', 'id', userId))?.full_name);
}

async function providerClientName(db: LookupDb, id: string | null): Promise<string | null> {
  if (!id) return null;
  return text((await db.one('provider_clients', 'name', 'id', id))?.name);
}

/** Name of the client of a booking: the account's name, or the provider's CRM entry for an own client. */
async function bookingClientName(db: LookupDb, booking: Row): Promise<string | null> {
  return (await profileName(db, text(booking.client_id))) ?? (await providerClientName(db, text(booking.provider_client_id)));
}

/** Values the template needs that `params` does not hold. Missing ones stay out, so the template check reports them. */
export async function notificationContext(row: ContextRow, db: LookupDb): Promise<Record<string, string>> {
  const params = (row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? row.params : {}) as Row;
  const out: Record<string, string> = {};
  const set = (key: string, value: string | null) => {
    if (value) out[key] = value;
  };

  switch (row.template) {
    case 'proposta_recebida': {
      const request = text(params.request_id) ? await db.one('requests', 'occupation_slug', 'id', String(params.request_id)) : null;
      set('occupation_name', await occupationName(db, text(request?.occupation_slug)));
      break;
    }
    case 'atendimento_confirmado':
    case 'lembrete_atendimento': {
      const booking = text(params.booking_id)
        ? await db.one('bookings', 'client_id, provider_id, provider_client_id, occupation_slug', 'id', String(params.booking_id))
        : null;
      if (!booking) break;
      set('occupation_name', await occupationName(db, text(booking.occupation_slug)));
      if (row.user_id && row.user_id === booking.provider_id) {
        set('other_party_name', await bookingClientName(db, booking));
      } else {
        set('other_party_name', text(params.provider_name) ?? text((await db.one('providers', 'display_name', 'id', String(booking.provider_id)))?.display_name));
      }
      break;
    }
    case 'pagamento_recebido': {
      const payment = text(params.payment_id)
        ? await db.one('payments', 'payer_id, booking_id, quote_id', 'id', String(params.payment_id))
        : null;
      if (!payment) break;
      let name = await profileName(db, text(payment.payer_id));
      if (!name && text(payment.quote_id)) {
        name = text((await db.one('quotes', 'client_name', 'id', String(payment.quote_id)))?.client_name);
      }
      if (!name && text(payment.booking_id)) {
        const booking = await db.one('bookings', 'provider_client_id', 'id', String(payment.booking_id));
        name = booking ? await providerClientName(db, text(booking.provider_client_id)) : null;
      }
      set('client_name', name);
      break;
    }
    case 'plantao_oferecido': {
      const shift = text(params.shift_id) ? await db.one('shifts', 'household_id', 'id', String(params.shift_id)) : null;
      const household = text(shift?.household_id) ? await db.one('households', 'neighborhood_id', 'id', String(shift?.household_id)) : null;
      const neighborhood = text(household?.neighborhood_id)
        ? await db.one('neighborhoods', 'name', 'id', String(household?.neighborhood_id))
        : null;
      set('neighborhood_name', text(neighborhood?.name));
      break;
    }
    default:
      break;
  }
  return out;
}
