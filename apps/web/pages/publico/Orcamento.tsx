import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { AppError, toAppError } from '../../lib/errors';
import { backendEnabled } from '../../lib/supabase';
import { formatCents } from '../../lib/money';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getQuoteByToken, lineTotalCents, respondQuote, type PublicQuote, type PublicQuoteStatus } from '../../services/publicQuotes';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { dangerButton, primaryButton, secondaryButton } from '../../components/cliente/styles';

// Hides the app chrome when the quote is printed or saved as PDF
const PRINT_CSS = `@media print {
  nav, footer, [role="note"].bg-amber-100 { display: none !important; }
  body, .bg-gray-50 { background: #fff !important; }
}`;

const STATUS_TEXT: Record<Exclude<PublicQuoteStatus, 'draft' | 'sent'>, { text: string; style: string }> = {
  accepted: { text: 'Orçamento aceito. A sua resposta foi registrada para o profissional.', style: 'bg-green-50 border-green-100 text-green-800' },
  declined: { text: 'Orçamento recusado. A sua resposta foi registrada para o profissional.', style: 'bg-gray-50 border-gray-200 text-gray-700' },
  expired: { text: 'Este orçamento passou da validade e não pode mais ser respondido.', style: 'bg-amber-50 border-amber-100 text-amber-800' },
};

/** Errors of respond_quote that read better with quote wording than with the shared table. */
const responseError = (err: unknown): unknown => {
  const error = toAppError(err);
  if (error.code === 'invalid_transition') return new AppError('invalid_transition', { cause: err, message: 'Este orçamento já foi respondido.' });
  if (error.code === 'not_allowed') return new AppError('not_found', { cause: err, message: 'Não encontramos este orçamento. Peça um novo link ao profissional.' });
  return error;
};

const QuoteView: React.FC<{ quote: PublicQuote; token: string; onChanged: () => void }> = ({ quote, token, onChanged }) => {
  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const respond = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await respondQuote(token, accept);
      setConfirming(null);
    } catch (err) {
      setError(responseError(err));
    } finally {
      setBusy(false);
      onChanged(); // also after a failure: the quote may have expired or been answered meanwhile
    }
  };

  const answered = quote.status === 'sent' ? null : STATUS_TEXT[quote.status as keyof typeof STATUS_TEXT];

  return (
    <article className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-8 shadow-xs space-y-6" aria-labelledby="orcamento-titulo">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-500">Orçamento de</p>
        <p className="text-lg font-bold text-primary break-words">
          {quote.provider.page_public ? (
            <Link to={`/p/${encodeURIComponent(quote.provider.slug)}`} className="hover:underline">{quote.provider.display_name}</Link>
          ) : (
            quote.provider.display_name
          )}
        </p>
        <h1 id="orcamento-titulo" className="text-2xl font-bold text-gray-800 break-words">{quote.title}</h1>
        {quote.client_name && <p className="text-sm text-gray-600 break-words">Para: {quote.client_name}</p>}
        <p className="text-xs text-gray-500">
          Emitido em {formatDateBR(quote.created_at)}
          {quote.valid_until && <> · Válido até {formatDateBR(quote.valid_until)}</>}
        </p>
      </header>

      <section aria-labelledby="orcamento-itens">
        <h2 id="orcamento-itens" className="sr-only">Itens</h2>
        {quote.items.length === 0 ? (
          <p className="text-sm text-gray-500">Este orçamento não tem itens detalhados.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {quote.items.map((item, index) => (
              <li key={index} className="py-3 flex flex-wrap justify-between gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 break-words">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity.toLocaleString('pt-BR')} × {formatCents(item.unit_price_cents)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{formatCents(lineTotalCents(item))}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between items-baseline pt-4 text-gray-900">
          <span className="font-bold">Total</span>
          <span className="text-2xl font-bold">{formatCents(quote.total_cents)}</span>
        </p>
      </section>

      {quote.notes && (
        <section aria-labelledby="orcamento-obs">
          <h2 id="orcamento-obs" className="font-bold text-gray-800 text-sm mb-1">Observações</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line break-words">{quote.notes}</p>
        </section>
      )}

      {answered && (
        <p role="status" className={`border rounded-xl p-3 text-sm flex items-start gap-2 ${answered.style}`}>
          {quote.status === 'accepted' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> : <XCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <span>{answered.text}</span>
        </p>
      )}

      <ErrorAlert error={error} className="print:hidden" />

      <div className="flex flex-wrap gap-3 print:hidden">
        {quote.status === 'sent' && confirming === null && (
          <>
            <button type="button" className={primaryButton} onClick={() => setConfirming('accept')}>Aceitar orçamento</button>
            <button type="button" className={dangerButton} onClick={() => setConfirming('decline')}>Recusar orçamento</button>
          </>
        )}
        {quote.status === 'sent' && confirming !== null && (
          <div className="w-full space-y-3">
            <p className="text-sm text-gray-700">
              {confirming === 'accept'
                ? `Confirmar que você aceita este orçamento de ${formatCents(quote.total_cents)}? A resposta fica registrada para o profissional.`
                : 'Confirmar que você recusa este orçamento? A resposta fica registrada para o profissional.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={confirming === 'accept' ? primaryButton : dangerButton}
                disabled={busy}
                onClick={() => void respond(confirming === 'accept')}
              >
                {busy ? 'Enviando…' : confirming === 'accept' ? 'Sim, aceitar' : 'Sim, recusar'}
              </button>
              <button type="button" className={secondaryButton} disabled={busy} onClick={() => setConfirming(null)}>Voltar</button>
            </div>
          </div>
        )}
        <button type="button" className={secondaryButton} onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" /> Imprimir ou salvar em PDF
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Este orçamento é uma proposta do profissional. Aceitar não gera cobrança automática: o pagamento é combinado com o profissional.
      </p>
    </article>
  );
};

const Orcamento: React.FC = () => {
  const { token = '' } = useParams();
  const quote = useAsync(() => (backendEnabled ? getQuoteByToken(token) : Promise.resolve(null)), `${backendEnabled}:${token}`);

  // The link is private: keep it out of search engines
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  if (!backendEnabled) {
    return (
      <BackendNotice title="Orçamentos online ainda não disponíveis">
        <p>Nesta versão de demonstração, não há orçamentos reais para responder.</p>
      </BackendNotice>
    );
  }
  if (quote.loading && !quote.data && !quote.error) return <PageStatus />;
  if (quote.error && !quote.data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <ErrorAlert error={quote.error} />
      </div>
    );
  }
  if (!quote.data) {
    return (
      <BackendNotice title="Orçamento não encontrado">
        <p>Não encontramos este orçamento. Confira o link ou peça um novo ao profissional.</p>
      </BackendNotice>
    );
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <style>{PRINT_CSS}</style>
      <QuoteView quote={quote.data} token={token} onChanged={quote.reload} />
    </div>
  );
};

export default Orcamento;
