import React from 'react';
import { formatCents } from '../../lib/money';
import { formatDateBR } from '../../lib/timezone';
import type { QuoteItem, QuoteRow } from '../../services/quotes';

// While printing, everything but the document is hidden, so the browser's
// "save as PDF" produces a clean page (the menu, banners and forms stay out).
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .quote-print, .quote-print * { visibility: visible !important; }
  .quote-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0 16px; border: 0 !important; box-shadow: none !important; }
  .quote-print table { page-break-inside: auto; }
  .quote-print tr { page-break-inside: avoid; }
}
`;

interface Props {
  quote: Pick<QuoteRow, 'title' | 'client_name' | 'items' | 'total_cents' | 'valid_until' | 'notes' | 'created_at'>;
  providerName: string;
}

const lineTotal = (item: QuoteItem): number => Math.round(item.quantity * item.unit_price_cents);

/** The quote as a page: on screen a preview, in print the only thing printed. */
const QuoteDocument: React.FC<Props> = ({ quote, providerName }) => (
  <article className="quote-print bg-white border border-gray-200 rounded-2xl p-5 space-y-4 text-gray-900" aria-label="Versão para impressão do orçamento">
    <style>{PRINT_CSS}</style>
    <header className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-gray-500">Orçamento</p>
      <h2 className="text-xl font-bold break-words">{quote.title}</h2>
      <p className="text-sm text-gray-600">Profissional: {providerName}</p>
      {quote.client_name && <p className="text-sm text-gray-600">Cliente: {quote.client_name}</p>}
      <p className="text-sm text-gray-600">Emitido em {formatDateBR(quote.created_at)}</p>
    </header>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 font-medium text-right">Qtd.</th>
            <th className="py-2 pr-2 font-medium text-right">Preço unitário</th>
            <th className="py-2 font-medium text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, index) => (
            <tr key={index} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-2 break-words">{item.description}</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap">{item.quantity.toLocaleString('pt-BR')}</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap">{formatCents(item.unit_price_cents)}</td>
              <td className="py-2 text-right whitespace-nowrap">{formatCents(lineTotal(item))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="text-right text-lg font-bold">Total: {formatCents(quote.total_cents)}</p>
    {quote.valid_until && <p className="text-sm text-gray-600">Válido até {formatDateBR(quote.valid_until)}.</p>}
    {quote.notes && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{quote.notes}</p>}
    <p className="text-xs text-gray-400">Este documento é um orçamento e não substitui nota fiscal.</p>
  </article>
);

export default QuoteDocument;
