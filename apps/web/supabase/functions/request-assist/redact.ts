// Redaction of the client's free text before it is sent to the model (request-assist).
//
// The text leaves the server without CPF, CNPJ, phone, e-mail, link or CEP. CPF, CNPJ,
// phone, e-mail and link come from scrubContacts (_shared/ai-guard.ts), which quote-assist
// and care-summary already use; the CEP is handled here. Names and addresses are not
// redacted: the assistant needs the neighborhood for the summary, and the list above is
// what this function promises.
// Pure function: no Deno, no network. Tested in test/functions/request-assist-redact.test.ts.

import { prepareUserText } from '../_shared/ai-guard.ts';

// Eight digits in CEP form, with an optional hyphen or space. Longer or shorter digit runs do
// not match, and the boundaries (?<!\d) (?!\d) keep it from matching inside a longer number.
const CEP = /(?<!\d)\d{5}[-\s]?\d{3}(?!\d)/g;

/** The text without contact and document numbers, ready for the model. Idempotent. */
export function redactPersonalData(text: string): string {
  return prepareUserText(text).replace(CEP, '[cep omitido]');
}
