import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Plus } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { formatCents } from '../../lib/money';
import { formatPhoneBR } from '../../lib/phone';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { listMyBookings, type BookingView } from '../../services/proAgenda';
import { clientHistory, countBookingsByClient, deleteClient, listClients, saveClient, type ClientRow, type HistoryEntry } from '../../services/proClients';
import { clientsCsv, csvFileName, downloadCsv } from '../../services/proExport';
import { listQuotes, type QuoteRow } from '../../services/quotes';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { BOOKING_STATUS_LABELS, QUOTE_STATUS_LABELS } from '../../components/pro/labels';
import { Badge, Card, ConfirmButton, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/pro/styles';

interface Draft {
  id?: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const EMPTY: Draft = { name: '', phone: '', email: '', notes: '' };

const ClientForm: React.FC<{ providerId: string; initial: Draft; onDone: () => void; onCancel: () => void }> = ({
  providerId,
  initial,
  onDone,
  onCancel,
}) => {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveClient({ ...draft, providerId });
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label={draft.id ? 'Editar cliente' : 'Novo cliente'}>
      <Field id="cli-nome" label="Nome">
        <input id="cli-nome" className={inputClass} autoComplete="off" value={draft.name} onChange={e => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="cli-telefone" label="Celular com DDD (opcional)">
          <input id="cli-telefone" className={inputClass} type="tel" autoComplete="off" value={draft.phone} onChange={e => set('phone', e.target.value)} />
        </Field>
        <Field id="cli-email" label="E-mail (opcional)">
          <input id="cli-email" className={inputClass} type="email" autoComplete="off" value={draft.email} onChange={e => set('email', e.target.value)} />
        </Field>
      </div>
      <Field id="cli-notas" label="Anotações (opcional)" hint="Só você vê. Evite dados de saúde ou outros dados sensíveis do cliente.">
        <textarea id="cli-notas" className={inputClass} rows={3} maxLength={4000} value={draft.notes} onChange={e => set('notes', e.target.value)} />
      </Field>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar cliente'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const draftOf = (client: ClientRow): Draft => ({
  id: client.id,
  name: client.name,
  phone: formatPhoneBR(client.phone),
  email: client.email ?? '',
  notes: client.notes ?? '',
});

/** Deleting unlinks the bookings of the client (the database sets provider_client_id to null): say so before. */
const deleteQuestion = (name: string, bookings: number): string => {
  if (bookings === 0) return `Excluir ${name}?`;
  const them = bookings === 1 ? 'O atendimento dele' : `Os ${bookings} atendimentos dele`;
  return `Excluir ${name}? ${them} continua${bookings === 1 ? '' : 'm'} na agenda, mas sem o nome do cliente, e deixa${bookings === 1 ? '' : 'm'} de ser somado${bookings === 1 ? '' : 's'} ao limite semanal por cliente.`;
};

const HISTORY_SHOWN = 10;

/** Bookings and quotes of one client, newest first; collapsed so the list stays short. */
const History: React.FC<{ entries: HistoryEntry[] }> = ({ entries }) => {
  if (entries.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-primary font-medium">Histórico ({entries.length})</summary>
      <ul className="mt-2 space-y-1 text-sm text-gray-700">
        {entries.slice(0, HISTORY_SHOWN).map(entry => (
          <li key={entry.key}>
            {formatDateBR(entry.at.toISOString())} ·{' '}
            {entry.kind === 'booking'
              ? `Atendimento de ${findOccupation(entry.occupationSlug)?.name ?? entry.occupationSlug} · ${BOOKING_STATUS_LABELS[entry.status]}`
              : `Orçamento "${entry.title}" · ${QUOTE_STATUS_LABELS[entry.status]}`}{' '}
            · {formatCents(entry.cents)}
          </li>
        ))}
      </ul>
      {entries.length > HISTORY_SHOWN && (
        <p className="text-xs text-gray-500 mt-1">Mostrando os {HISTORY_SHOWN} mais recentes de {entries.length}.</p>
      )}
    </details>
  );
};

const Clients: React.FC = () => {
  const { provider } = useProvider();
  const clients = useAsync(async () => {
    const [list, bookings, historyBookings, historyQuotes] = await Promise.all([
      listClients(provider.id),
      countBookingsByClient(provider.id),
      // The history is a convenience: when it cannot be read the list still works
      listMyBookings(provider.id).catch((): BookingView[] => []),
      listQuotes(provider.id).catch((): QuoteRow[] => []),
    ]);
    return { list, bookings, historyBookings, historyQuotes };
  }, provider.id);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<unknown>(null);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (clients.data?.list ?? []).filter(
      client => !term || client.name.toLowerCase().includes(term) || (client.phone ?? '').includes(term.replace(/\D/g, '') || '\u0000'),
    );
  }, [clients.data, filter]);

  if (clients.loading && !clients.data) return <PageStatus />;

  const remove = async (client: ClientRow) => {
    setError(null);
    try {
      await deleteClient(client.id);
      clients.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert error={clients.error} />
      <ErrorAlert error={error} />
      {editing ? (
        <Card as="section">
          <SectionTitle id="cli-form">{editing.id ? 'Editar cliente' : 'Novo cliente'}</SectionTitle>
          <ClientForm
            providerId={provider.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              clients.reload();
            }}
          />
        </Card>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className={primaryButton} onClick={() => setEditing(EMPTY)}>
            <Plus size={16} aria-hidden="true" /> Novo cliente
          </button>
          {(clients.data?.list.length ?? 0) > 0 && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => downloadCsv(csvFileName('clientes', todayInSaoPaulo()), clientsCsv(clients.data?.list ?? []))}
            >
              <Download size={16} aria-hidden="true" /> Exportar CSV
            </button>
          )}
          {(clients.data?.list.length ?? 0) > 0 && (
            <Field id="cli-busca" label="Buscar cliente" className="flex-1 min-w-48">
              <input id="cli-busca" type="search" className={inputClass} value={filter} onChange={e => setFilter(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {clients.data && clients.data.list.length === 0 && !editing && (
        <EmptyState>
          Você ainda não tem clientes cadastrados. Guarde aqui os contatos dos clientes que você já atende para criar atendimentos, orçamentos
          e cobranças. Quem fecha um serviço pelo WorkEasy entra aqui sozinho.
        </EmptyState>
      )}
      {clients.data && clients.data.list.length > 0 && visible.length === 0 && <EmptyState>Nenhum cliente encontrado.</EmptyState>}
      <ul className="space-y-3">
        {visible.map(client => (
          <Card as="li" key={client.id}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="font-bold text-gray-900 break-words min-w-0">{client.name}</h2>
              <Badge className={client.origin === 'platform' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}>
                {client.origin === 'platform' ? 'Veio pelo WorkEasy' : 'Cliente próprio'}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 break-words">
              {[formatPhoneBR(client.phone), client.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
            </p>
            {client.notes && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line break-words">{client.notes}</p>}
            <History entries={clientHistory(client.id, clients.data?.historyBookings ?? [], clients.data?.historyQuotes ?? [])} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <button type="button" className={secondaryButton} onClick={() => setEditing(draftOf(client))} aria-label={`Editar ${client.name}`}>
                <Pencil size={14} aria-hidden="true" /> Editar
              </button>
              <Link to={`/pro/agenda?cliente=${client.id}`} className={`${linkClass} text-sm`}>Novo atendimento</Link>
              <Link to={`/pro/orcamentos?cliente=${client.id}`} className={`${linkClass} text-sm`}>Novo orçamento</Link>
              <ConfirmButton
                label="Excluir"
                question={deleteQuestion(client.name, clients.data?.bookings[client.id] ?? 0)}
                confirmLabel="Sim, excluir"
                onConfirm={() => remove(client)}
              />
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
};

const Clientes: React.FC = () => (
  <ProPage title="Clientes">
    <Clients />
  </ProPage>
);

export default Clientes;
