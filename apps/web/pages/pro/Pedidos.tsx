import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Send } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { loadPublicSettings } from '../../config/features';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { listMyProposals, listOpenRequests, sendProposal, withdrawProposal, type OpenRequest } from '../../services/proMarketplace';
import { parseReaisToCents } from '../../services/proFormat';
import type { ProposalRow } from '../../services/types';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_STYLES, PROVIDER_STATUS_HELP } from '../../components/pro/labels';
import { Badge, Card, ConfirmButton, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/pro/styles';

const load = async (providerId: string) => {
  const [requests, proposals, settings] = await Promise.all([listOpenRequests(), listMyProposals(providerId), loadPublicSettings()]);
  return { requests, proposals, limit: settings.proposalLimit, today: todayInSaoPaulo() };
};

type Data = Awaited<ReturnType<typeof load>>;

const ProposalForm: React.FC<{ providerId: string; request: OpenRequest; today: string; onSent: () => void; onCancel: () => void }> = ({
  providerId,
  request,
  today,
  onSent,
  onCancel,
}) => {
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const prefix = `prop-${request.id}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const priceCents = parseReaisToCents(price);
      if (priceCents === null) throw new AppError('invalid_input', { message: 'Informe o preço em reais, por exemplo 180,00.' });
      await sendProposal({ providerId, requestId: request.id, priceCents, message, validUntilDay: validUntil });
      onSent();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-gray-100 pt-4" noValidate aria-label="Enviar proposta">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id={`${prefix}-preco`} label="Seu preço (R$)">
          <input id={`${prefix}-preco`} className={inputClass} inputMode="decimal" placeholder="180,00" value={price} onChange={e => setPrice(e.target.value)} />
        </Field>
        <Field id={`${prefix}-validade`} label="Proposta válida até (opcional)">
          <input id={`${prefix}-validade`} type="date" min={today} className={inputClass} value={validUntil} onChange={e => setValidUntil(e.target.value)} />
        </Field>
      </div>
      <Field id={`${prefix}-mensagem`} label="Mensagem para o cliente (opcional)" hint="Diga o que está incluso e quando você pode ir. Não coloque telefone ou e-mail.">
        <textarea id={`${prefix}-mensagem`} className={inputClass} rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} />
      </Field>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          <Send size={16} aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar proposta'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

const RequestCard: React.FC<{ providerId: string; request: OpenRequest; data: Data; onChanged: () => void }> = ({ providerId, request, data, onChanged }) => {
  const [open, setOpen] = useState(false);
  const mine = data.proposals.find(item => item.id === request.my_proposal_id);
  return (
    <Card as="li">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="font-bold text-gray-900">{findOccupation(request.occupation_slug)?.name ?? request.occupation_slug}</h3>
        {request.urgent && <Badge className="bg-amber-100 text-amber-800">Urgente</Badge>}
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <MapPin size={12} aria-hidden="true" /> {request.neighborhood_name}
        </span>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-line break-words">{request.description}</p>
      {request.preferred_dates && <p className="text-sm text-gray-600 mt-1">Quando: {request.preferred_dates}</p>}
      <p className="text-xs text-gray-500 mt-2">
        {request.proposal_count} de {data.limit} propostas já enviadas · pedido aberto até {formatDateBR(request.expires_at)}
      </p>
      {request.my_proposal_id ? (
        <p className="text-sm text-gray-700 mt-3">
          Você já enviou uma proposta{mine ? ` de ${formatCents(mine.price_cents)}` : ''}
          {request.my_proposal_status ? `: ${PROPOSAL_STATUS_LABELS[request.my_proposal_status].toLowerCase()}` : ''}.
        </p>
      ) : open ? (
        <ProposalForm
          providerId={providerId}
          request={request}
          today={data.today}
          onCancel={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            onChanged();
          }}
        />
      ) : (
        <button type="button" className={`${primaryButton} mt-3`} onClick={() => setOpen(true)}>
          Enviar proposta
        </button>
      )}
    </Card>
  );
};

const SentProposals: React.FC<{ data: Data; onWithdraw: (proposal: ProposalRow) => Promise<void> }> = ({ data, onWithdraw }) => {
  const requestOf = (id: string) => data.requests.find(item => item.id === id);
  return (
    <section aria-labelledby="ped-enviadas" className="space-y-3">
      <SectionTitle id="ped-enviadas">Propostas enviadas</SectionTitle>
      {data.proposals.length === 0 ? (
        <EmptyState>Você ainda não enviou propostas.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.proposals.map(proposal => {
            const request = requestOf(proposal.request_id);
            return (
              <Card as="li" key={proposal.id}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{formatCents(proposal.price_cents)}</span>
                  <Badge className={PROPOSAL_STATUS_STYLES[proposal.status]}>{PROPOSAL_STATUS_LABELS[proposal.status]}</Badge>
                  <span className="text-xs text-gray-500">Enviada em {formatDateBR(proposal.created_at)}</span>
                </div>
                {request && (
                  <p className="text-sm text-gray-600">
                    {findOccupation(request.occupation_slug)?.name ?? request.occupation_slug} · {request.neighborhood_name}
                  </p>
                )}
                {proposal.message && <p className="text-sm text-gray-700 mt-1 whitespace-pre-line break-words">{proposal.message}</p>}
                {proposal.valid_until && <p className="text-xs text-gray-500 mt-1">Válida até {formatDateBR(proposal.valid_until)}</p>}
                {proposal.status === 'accepted' && (
                  <p className="text-sm mt-2">
                    O cliente escolheu a sua proposta.{' '}
                    <Link to="/pro/agenda" className={linkClass}>Ver na agenda</Link>
                  </p>
                )}
                {proposal.status === 'sent' && (
                  <div className="mt-3">
                    <ConfirmButton
                      label="Retirar proposta"
                      question="Retirar esta proposta?"
                      confirmLabel="Sim, retirar"
                      onConfirm={() => onWithdraw(proposal)}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </section>
  );
};

const Requests: React.FC = () => {
  const { provider } = useProvider();
  const approved = provider.status === 'approved';
  // A provider that is not approved never calls the function: the database answers empty for them
  const data = useAsync(() => (approved ? load(provider.id) : Promise.resolve(null)), `${provider.id}:${approved}`);
  const [error, setError] = useState<unknown>(null);

  if (!approved) {
    return (
      <Card as="section">
        <h2 className="text-lg font-bold text-gray-800 mb-2">Você ainda não recebe pedidos</h2>
        <p className="text-sm text-gray-600">{PROVIDER_STATUS_HELP[provider.status]}</p>
        <Link to="/pro/cadastro" className={`${primaryButton} mt-4`}>
          Ir para o cadastro
        </Link>
      </Card>
    );
  }
  if (data.loading && !data.data) return <PageStatus />;

  const withdraw = async (proposal: ProposalRow) => {
    setError(null);
    try {
      await withdrawProposal(proposal.id);
      data.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert error={data.error} />
      <ErrorAlert error={error} />
      {data.data && (
        <>
          <p className="text-sm text-gray-600">
            Pedidos de clientes para as suas ocupações e os bairros que você atende. O telefone e o e-mail do cliente não aparecem aqui:
            se ele escolher a sua proposta, o atendimento entra na sua agenda.
          </p>
          <section aria-labelledby="ped-abertos" className="space-y-3">
            <SectionTitle id="ped-abertos">Pedidos abertos</SectionTitle>
            {data.data.requests.length === 0 ? (
              <EmptyState>
                Nenhum pedido aberto para você agora. Confira se os seus bairros estão marcados em{' '}
                <Link to="/pro/cadastro" className={linkClass}>Cadastro</Link> e se a opção de receber pedidos novos está marcada em “Dados da página”.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {data.data.requests.map(request => (
                  <RequestCard key={request.id} providerId={provider.id} request={request} data={data.data as Data} onChanged={data.reload} />
                ))}
              </ul>
            )}
          </section>
          <SentProposals data={data.data} onWithdraw={withdraw} />
        </>
      )}
    </div>
  );
};

const Pedidos: React.FC = () => (
  <ProPage title="Pedidos de clientes" banner={false}>
    <Requests />
  </ProPage>
);

export default Pedidos;
