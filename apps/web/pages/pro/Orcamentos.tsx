import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, MessageCircle, Plus, Printer, Trash2 } from 'lucide-react';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { formatPhoneBR } from '../../lib/phone';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { listClients, type ClientRow } from '../../services/proClients';
import { centsToInput, parseReaisToCents } from '../../services/proFormat';
import {
  deleteQuote,
  effectiveQuoteStatus,
  listQuotes,
  parseQuantity,
  quoteShareUrl,
  quoteTotalCents,
  quoteWhatsAppUrl,
  saveQuote,
  setQuoteStatus,
  type QuoteItem,
  type QuoteRow,
} from '../../services/quotes';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import QuoteDocument from '../../components/pro/QuoteDocument';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES } from '../../components/pro/labels';
import { Badge, Card, ConfirmButton, CopyButton, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/pro/styles';

interface ItemDraft {
  key: number;
  description: string;
  quantity: string;
  price: string;
}

let nextKey = 1;
const newItem = (): ItemDraft => ({ key: nextKey++, description: '', quantity: '1', price: '' });

const itemsOf = (quote: QuoteRow | null): ItemDraft[] =>
  quote && quote.items.length > 0
    ? quote.items.map(item => ({
        key: nextKey++,
        description: item.description,
        quantity: String(item.quantity).replace('.', ','),
        price: centsToInput(item.unit_price_cents),
      }))
    : [newItem()];

/** Items typed as text → items for the server; null fields are reported to the user, never guessed. */
const parseItems = (drafts: ItemDraft[]): QuoteItem[] =>
  drafts.map((draft, index) => {
    const quantity = parseQuantity(draft.quantity);
    const price = parseReaisToCents(draft.price);
    if (!draft.description.trim()) throw new AppError('invalid_input', { message: `Item ${index + 1}: informe a descrição.` });
    if (quantity === null) {
      throw new AppError('invalid_input', { message: `Item ${index + 1}: a quantidade precisa ser maior que zero, só com números e até 3 casas decimais (por exemplo 2 ou 1,5).` });
    }
    if (price === null) throw new AppError('invalid_input', { message: `Item ${index + 1}: informe o preço unitário em reais, por exemplo 80,00.` });
    return { description: draft.description.trim(), quantity, unit_price_cents: price };
  });

const previewTotal = (drafts: ItemDraft[]): number =>
  quoteTotalCents(
    drafts.flatMap(draft => {
      const quantity = parseQuantity(draft.quantity);
      const price = parseReaisToCents(draft.price);
      return quantity !== null && price !== null ? [{ description: draft.description, quantity, unit_price_cents: price }] : [];
    }),
  );

// ---- Share block --------------------------------------------------------------------

const SharePanel: React.FC<{ quote: QuoteRow }> = ({ quote }) => {
  const url = quoteShareUrl(quote.public_token);
  if (quote.status === 'draft') {
    return <p className="text-sm text-gray-600">O link para o cliente só passa a valer depois que você enviar o orçamento.</p>;
  }
  return (
    <div className="space-y-3">
      <Field id="orc-link" label="Link do orçamento" hint="Quem tem o link vê o orçamento e pode aceitar ou recusar. Não precisa de login.">
        <input id="orc-link" className={inputClass} readOnly value={url} onFocus={e => e.currentTarget.select()} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={url} label="Copiar link" />
        <a href={quoteWhatsAppUrl(quote)} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
          <MessageCircle size={16} aria-hidden="true" /> Abrir no WhatsApp
        </a>
        <a href={url} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
          <ExternalLink size={16} aria-hidden="true" /> Ver como o cliente vê
        </a>
      </div>
      <p className="text-xs text-gray-500">O WhatsApp abre com a mensagem pronta; nada é enviado até você tocar em enviar lá.</p>
    </div>
  );
};

// ---- Editor -------------------------------------------------------------------------

const Editor: React.FC<{
  providerId: string;
  providerName: string;
  clients: ClientRow[];
  initial: QuoteRow | null;
  defaultClient: string;
  today: string;
  onChanged: () => void;
  onClose: () => void;
}> = ({ providerId, providerName, clients, initial, defaultClient, today, onChanged, onClose }) => {
  const preset = !initial ? clients.find(client => client.id === defaultClient) : undefined;
  const [saved, setSaved] = useState<QuoteRow | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [clientId, setClientId] = useState(initial?.provider_client_id ?? preset?.id ?? '');
  const [clientName, setClientName] = useState(initial?.client_name ?? preset?.name ?? '');
  const [clientPhone, setClientPhone] = useState(formatPhoneBR(initial?.client_phone ?? preset?.phone));
  const [items, setItems] = useState<ItemDraft[]>(() => itemsOf(initial));
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);

  const shown = (quote: QuoteRow) => effectiveQuoteStatus(quote, today);
  const locked = saved !== null && saved.status !== 'draft' && saved.status !== 'sent';

  const pickClient = (id: string) => {
    setClientId(id);
    const client = clients.find(item => item.id === id);
    if (client) {
      setClientName(client.name);
      setClientPhone(formatPhoneBR(client.phone));
    }
  };

  const setItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));

  const persist = async (send: boolean) => {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      let quote = await saveQuote({
        id: saved?.id,
        providerId,
        providerClientId: clientId || null,
        clientName,
        clientPhone,
        title,
        items: parseItems(items),
        validUntil,
        notes,
      });
      // The draft exists now: remember it before trying to send, so a failed send and a new click update it instead of inserting another
      setSaved(quote);
      onChanged();
      if (send && quote.status === 'draft') {
        quote = await setQuoteStatus(quote.id, 'sent');
        setSaved(quote);
      }
      setMessage(send ? 'Orçamento enviado. Compartilhe o link com o cliente.' : 'Orçamento salvo.');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const backToDraft = async () => {
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await setQuoteStatus(saved.id, 'draft'));
      setMessage('O orçamento voltou para rascunho e o link deixou de valer.');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!saved) return;
    try {
      await deleteQuote(saved.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <Card as="section">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <SectionTitle id="orc-editor">{saved ? 'Orçamento' : 'Novo orçamento'}</SectionTitle>
          {saved && <Badge className={QUOTE_STATUS_STYLES[shown(saved)]}>{QUOTE_STATUS_LABELS[shown(saved)]}</Badge>}
        </div>
        {locked ? (
          <p className="text-sm text-gray-600 mb-3">Este orçamento já foi respondido ou venceu e não pode mais ser alterado.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void persist(false); }} className="space-y-4" noValidate aria-label="Dados do orçamento">
            <Field id="orc-titulo" label="Título">
              <input id="orc-titulo" className={inputClass} placeholder="Ex.: Pintura da sala" value={title} onChange={e => setTitle(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field id="orc-cliente" label="Cliente cadastrado">
                <select id="orc-cliente" className={inputClass} value={clientId} onChange={e => pickClient(e.target.value)}>
                  <option value="">Outro (digitar)</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="orc-nome" label="Nome do cliente">
                <input id="orc-nome" className={inputClass} value={clientName} onChange={e => setClientName(e.target.value)} />
              </Field>
              <Field id="orc-telefone" label="Celular do cliente (opcional)">
                <input id="orc-telefone" className={inputClass} type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
              </Field>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-gray-700 mb-1">Itens</legend>
              {items.map((item, index) => (
                <div key={item.key} className="grid grid-cols-6 gap-2 items-end border border-gray-100 rounded-xl p-3">
                  <Field id={`orc-item-${item.key}-desc`} label={`Item ${index + 1}: descrição`} className="col-span-6">
                    <input id={`orc-item-${item.key}-desc`} className={inputClass} value={item.description} onChange={e => setItem(item.key, { description: e.target.value })} />
                  </Field>
                  <Field id={`orc-item-${item.key}-qtd`} label={`Item ${index + 1}: quantidade`} className="col-span-2">
                    <input id={`orc-item-${item.key}-qtd`} className={inputClass} inputMode="decimal" value={item.quantity} onChange={e => setItem(item.key, { quantity: e.target.value })} />
                  </Field>
                  <Field id={`orc-item-${item.key}-preco`} label={`Item ${index + 1}: preço unitário (R$)`} className="col-span-3">
                    <input id={`orc-item-${item.key}-preco`} className={inputClass} inputMode="decimal" placeholder="80,00" value={item.price} onChange={e => setItem(item.key, { price: e.target.value })} />
                  </Field>
                  <button
                    type="button"
                    className="col-span-1 inline-flex items-center justify-center rounded-xl border border-gray-200 py-2.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setItems(current => current.filter(other => other.key !== item.key))}
                    disabled={items.length === 1}
                    aria-label={`Remover item ${index + 1}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" className={secondaryButton} onClick={() => setItems(current => [...current, newItem()])}>
                <Plus size={16} aria-hidden="true" /> Adicionar item
              </button>
              <p className="text-sm text-gray-700" aria-live="polite">
                Total estimado: <strong>{formatCents(previewTotal(items))}</strong>. O valor final é calculado pelo servidor ao salvar.
              </p>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="orc-validade" label="Válido até (opcional)">
                <input id="orc-validade" type="date" min={today} className={inputClass} value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </Field>
            </div>
            <Field id="orc-notas" label="Observações (opcional)" hint="Prazo, forma de pagamento, o que não está incluso.">
              <textarea id="orc-notas" className={inputClass} rows={3} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} />
            </Field>
            {saved?.status === 'sent' && (
              <p className="text-xs text-gray-500">Este orçamento já foi enviado: ao salvar, o cliente passa a ver a versão nova pelo mesmo link.</p>
            )}
            <ErrorAlert error={error} />
            {message && <p role="status" className="text-sm text-green-700">{message}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={saved?.status === 'sent' ? primaryButton : secondaryButton} disabled={busy}>
                {busy ? 'Salvando…' : saved ? 'Salvar alterações' : 'Salvar rascunho'}
              </button>
              {(!saved || saved.status === 'draft') && (
                <button type="button" className={primaryButton} disabled={busy} onClick={() => void persist(true)}>
                  Salvar e enviar ao cliente
                </button>
              )}
              <button type="button" className={secondaryButton} onClick={onClose}>
                Voltar à lista
              </button>
            </div>
          </form>
        )}
        {locked && (
          <div className="space-y-2">
            <ErrorAlert error={error} />
            <button type="button" className={secondaryButton} onClick={onClose}>
              Voltar à lista
            </button>
          </div>
        )}
      </Card>

      {saved && (
        <>
          <Card as="section">
            <SectionTitle id="orc-compartilhar">Compartilhar</SectionTitle>
            <SharePanel quote={saved} />
            {saved.status === 'accepted' && (
              <p className="text-sm mt-3">
                O cliente aceitou. <Link to={`/pro/cobrancas?orcamento=${saved.id}`} className={linkClass}>Cobrar este orçamento</Link>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              {saved.status === 'sent' && (
                <ConfirmButton
                  label="Voltar para rascunho"
                  question="O link deixa de valer. Voltar para rascunho?"
                  confirmLabel="Sim, voltar"
                  onConfirm={backToDraft}
                  disabled={busy}
                />
              )}
              {saved.status === 'draft' && (
                <ConfirmButton label="Excluir rascunho" question="Excluir este rascunho?" confirmLabel="Sim, excluir" onConfirm={remove} />
              )}
            </div>
          </Card>
          <section aria-labelledby="orc-imprimir" className="space-y-3">
            <SectionTitle
              id="orc-imprimir"
              action={
                <button type="button" className={secondaryButton} onClick={() => window.print()}>
                  <Printer size={16} aria-hidden="true" /> Imprimir ou salvar em PDF
                </button>
              }
            >
              Versão para imprimir
            </SectionTitle>
            <QuoteDocument quote={saved} providerName={providerName} />
          </section>
        </>
      )}
    </div>
  );
};

// ---- List ---------------------------------------------------------------------------

const Quotes: React.FC = () => {
  const { provider } = useProvider();
  const [params] = useSearchParams();
  const data = useAsync(async () => ({ quotes: await listQuotes(provider.id), clients: await listClients(provider.id), today: todayInSaoPaulo() }), provider.id);
  const presetClient = params.get('cliente') ?? '';
  // "new" opens an empty editor; a quote id opens that quote
  const [selected, setSelected] = useState<string | null>(presetClient ? 'new' : null);

  if (data.loading && !data.data) return <PageStatus />;
  const open = selected && selected !== 'new' ? data.data?.quotes.find(item => item.id === selected) ?? null : null;

  if (data.data && selected) {
    return (
      <Editor
        key={selected}
        providerId={provider.id}
        providerName={provider.display_name}
        clients={data.data.clients}
        initial={open}
        defaultClient={presetClient}
        today={data.data.today}
        onChanged={data.reload}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ErrorAlert error={data.error} />
      <button type="button" className={primaryButton} onClick={() => setSelected('new')}>
        <Plus size={16} aria-hidden="true" /> Novo orçamento
      </button>
      {data.data && data.data.quotes.length === 0 && (
        <EmptyState>
          Você ainda não fez orçamentos. Monte um com os itens e preços, envie o link ao cliente e acompanhe se ele aceitou.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {(data.data?.quotes ?? []).map(quote => (
          <Card as="li" key={quote.id}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="font-bold text-gray-900 break-words min-w-0">{quote.title}</h2>
              <Badge className={QUOTE_STATUS_STYLES[effectiveQuoteStatus(quote, data.data?.today ?? '')]}>
                {QUOTE_STATUS_LABELS[effectiveQuoteStatus(quote, data.data?.today ?? '')]}
              </Badge>
            </div>
            <p className="text-sm text-gray-700">
              {quote.client_name ?? 'Sem cliente'} · {formatCents(quote.total_cents)}
              {quote.valid_until ? ` · válido até ${formatDateBR(quote.valid_until)}` : ''}
            </p>
            <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setSelected(quote.id)} aria-label={`Abrir ${quote.title}`}>
              Abrir
            </button>
          </Card>
        ))}
      </ul>
    </div>
  );
};

const Orcamentos: React.FC = () => (
  <ProPage title="Orçamentos">
    <Quotes />
  </ProPage>
);

export default Orcamentos;
