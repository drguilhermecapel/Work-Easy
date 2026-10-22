// Concierge mode (no backend): the request becomes a WhatsApp message to the
// operation, which answers by WhatsApp. Nothing is sent until the user taps send.

export interface ConciergeRequest {
  occupationName: string;
  neighborhoodName: string;
  city: string;
  description: string;
  when?: string;
  urgent?: boolean;
  name?: string;
}

export const buildConciergeMessage = (request: ConciergeRequest): string =>
  [
    'Olá! Quero fazer um pedido pelo WorkEasy.',
    '',
    `Serviço: ${request.occupationName}`,
    `Bairro: ${request.neighborhoodName} (${request.city})`,
    request.when?.trim() ? `Quando: ${request.when.trim()}` : null,
    request.urgent ? 'É urgente.' : null,
    `Descrição: ${request.description.trim()}`,
    request.name?.trim() ? `Nome: ${request.name.trim()}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

/** https://wa.me/<digits>?text=<message>, the link format WhatsApp documents for click-to-chat. */
export const conciergeLink = (number: string, message: string): string =>
  `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
