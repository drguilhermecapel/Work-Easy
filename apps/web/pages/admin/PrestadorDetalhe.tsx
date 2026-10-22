import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ActionButton } from '../../components/admin/ConfirmAction';
import DocumentCard from '../../components/admin/DocumentCard';
import { formatDateTime } from '../../components/admin/format';
import { PROVIDER_STATUS_LABELS, PROVIDER_STATUS_STYLES } from '../../components/admin/labels';
import OccupationCard from '../../components/admin/OccupationCard';
import { Badge, Card, EmptyState } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { approvalCheck, getProviderDetail, setProviderStatus } from '../../services/admin';

const PrestadorDetalhe: React.FC = () => {
  const { id = '' } = useParams();
  const detail = useAsync(() => getProviderDetail(id), id);

  const back = (
    <Link to="/admin/prestadores" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
      <ArrowLeft size={16} aria-hidden="true" /> Voltar para a lista de prestadores
    </Link>
  );

  if (detail.loading && !detail.data) return <PageStatus />;
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorAlert error={detail.error} />
      </div>
    );
  }

  const { provider, profile, occupations, documents } = detail.data;
  const reload = detail.reload;
  const approvedCount = occupations.filter(o => o.approved).length;
  // The first approval (from draft or review) also approves the occupations whose policy is fully covered; the database decides, this only tells
  const firstApproval = provider.status === 'draft' || provider.status === 'pending_review';
  const eligible = (o: (typeof occupations)[number]) => !o.approved && approvalCheck(o, documents).ok;
  const joinNow = occupations.filter(eligible).map(o => o.name);
  const stayPending = occupations.filter(o => !o.approved && !eligible(o)).map(o => o.name);

  return (
    <div className="space-y-6">
      {back}
      <ErrorAlert error={detail.error} />

      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge className={PROVIDER_STATUS_STYLES[provider.status]}>{PROVIDER_STATUS_LABELS[provider.status]}</Badge>
          <Badge className="bg-gray-100 text-gray-700">{provider.plan === 'pro' ? 'Plano Pro' : 'Plano gratuito'}</Badge>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 break-words">{provider.display_name}</h1>
        <dl className="text-sm text-gray-700 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {profile?.full_name && (
            <>
              <dt className="text-gray-500">Nome da conta</dt>
              <dd className="break-words">{profile.full_name}</dd>
            </>
          )}
          <dt className="text-gray-500">Telefone da conta</dt>
          <dd className="break-words">{profile?.phone || 'Não informado'}</dd>
          <dt className="text-gray-500">Página</dt>
          <dd className="break-all">/p/{provider.slug}</dd>
          <dt className="text-gray-500">Cadastro em</dt>
          <dd>{formatDateTime(provider.created_at)}</dd>
        </dl>
        {provider.bio && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line break-words">{provider.bio}</p>}

        <p className="text-sm text-gray-600 mt-3">
          {approvedCount} de {occupations.length} {occupations.length === 1 ? 'ocupação aprovada' : 'ocupações aprovadas'}. A aprovação do prestador e a de
          cada ocupação são separadas: só a ocupação aprovada aparece na busca e recebe pedidos.
        </p>

        <div className="flex flex-wrap gap-2 mt-4">
          {firstApproval && (
            <ActionButton
              label="Aprovar prestador"
              tone="primary"
              title="Aprovar este prestador"
              description={
                <>
                  <p>Aprovar libera a conta do prestador. As ocupações são aprovadas uma a uma, abaixo, com os documentos que a política pede aceitos.</p>
                  <p>
                    {joinNow.length > 0
                      ? `Entram junto, porque já têm todos os documentos aceitos: ${joinNow.join(', ')}.`
                      : 'Nenhuma ocupação entra junto: nenhuma tem ainda todos os documentos aceitos.'}
                    {stayPending.length > 0 && ` Ficam a aprovar: ${stayPending.join(', ')}.`}
                  </p>
                </>
              }
              reason="required"
              confirmLabel="Confirmar"
              onConfirm={reason => setProviderStatus(provider.id, 'approved', reason)}
              onDone={reload}
            />
          )}
          {provider.status === 'suspended' && (
            <ActionButton
              label="Reativar prestador"
              tone="primary"
              title="Reativar este prestador"
              description={
                <>
                  <p>O prestador volta a receber pedidos nas ocupações que já estavam aprovadas.</p>
                  <p>Reativar não aprova ocupações incluídas depois: elas seguem a aprovar, uma a uma.</p>
                </>
              }
              reason="required"
              confirmLabel="Reativar"
              onConfirm={reason => setProviderStatus(provider.id, 'approved', reason)}
              onDone={reload}
            />
          )}
          {provider.status !== 'suspended' && (
            <ActionButton
              label="Suspender prestador"
              tone="danger"
              title="Suspender este prestador"
              description={<p>O prestador sai da busca e deixa de receber pedidos. Atendimentos já combinados seguem pelas regras normais.</p>}
              reason="required"
              confirmLabel="Suspender"
              onConfirm={reason => setProviderStatus(provider.id, 'suspended', reason)}
              onDone={reload}
            />
          )}
        </div>
      </Card>

      <section aria-labelledby="prestador-ocupacoes" className="space-y-3">
        <h2 id="prestador-ocupacoes" className="text-lg font-bold text-gray-800">Ocupações e registro profissional</h2>
        {occupations.length === 0 && <EmptyState>Este prestador não tem ocupação cadastrada.</EmptyState>}
        {occupations.map(occupation => (
          <OccupationCard key={occupation.occupation_slug} occupation={occupation} documents={documents} onChanged={reload} />
        ))}
      </section>

      <section aria-labelledby="prestador-documentos" className="space-y-3">
        <h2 id="prestador-documentos" className="text-lg font-bold text-gray-800">Documentos</h2>
        {documents.length === 0 && <EmptyState>Nenhum documento enviado.</EmptyState>}
        {documents.map(document => (
          <DocumentCard key={document.id} document={document} onChanged={reload} />
        ))}
      </section>
    </div>
  );
};

export default PrestadorDetalhe;
