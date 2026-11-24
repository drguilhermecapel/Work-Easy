// The exact requests the app's services send to the money and account functions, written out once.
//
// app-requests.test.ts (vitest only: it runs the app's services) checks that the app still builds each
// of these bodies, field for field. app-requests-handlers.test.ts feeds the same bodies to the real
// handlers, and runs in vitest AND in Deno (`npm run test:deno`): so the body the app sends today is
// shown to be accepted by the handler in the runtime the function is served by, not only in Node.
// Pure data with no imports beyond helpers.ts, so Deno can load it.

import { BOOKING_ID, QUOTE_ID, VALID_CPF } from './helpers.ts';

/** A client of the provider's CRM (with CPF/CNPJ on file). */
export const CRM_CLIENT_ID = '77777777-7777-4777-8777-777777777777';

export const APP_REQUESTS = {
  /** services/charges.createCharge: an own booking linked to a CRM client, with a due date. */
  chargeOwnBooking: { booking_id: BOOKING_ID, method: 'pix', due_date: '2030-01-16' },
  /** services/charges.createCharge: an accepted quote, the CRM client picked in the form. */
  chargeQuote: { quote_id: QUOTE_ID, method: 'boleto', provider_client_id: CRM_CLIENT_ID, description: 'Pintura da sala' },
  /** services/payments.createCharge: the client pays a platform booking, CPF typed in the form. */
  payBooking: { booking_id: BOOKING_ID, method: 'pix', cpf_cnpj: VALID_CPF },
  /** services/proBilling.subscribePro */
  subscribePro: { action: 'subscribe', method: 'boleto' },
  /** services/proBilling.cancelPro */
  cancelPro: { action: 'cancel' },
  /** services/proBilling.activateReceiving: a person (CPF, birth date). */
  activateReceiving: {
    name: 'Ana Souza', email: 'Ana@Example.com', cpf_cnpj: VALID_CPF, mobile_phone: '+5511987654321', income_value_cents: 500000,
    address: 'Rua Teste', address_number: '100', province: 'Pinheiros', postal_code: '05422000', birth_date: '1990-05-20',
  },
  /** services/account.deleteMyAccount */
  deleteAccount: { confirm: 'EXCLUIR' },
} as const;

/** What the form of activateReceiving holds for APP_REQUESTS.activateReceiving (punctuation as typed). */
export const RECEIVING_FORM = {
  name: 'Ana Souza', email: 'Ana@Example.com', cpfCnpj: '529.982.247-25', birthDate: '1990-05-20', mobilePhone: '(11) 98765-4321', incomeCents: 500000,
  address: 'Rua Teste', addressNumber: '100', province: 'Pinheiros', postalCode: '05422-000',
};
