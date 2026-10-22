import React from 'react';
import { ExternalLink } from 'lucide-react';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import {
  approvalCheck,
  missingSteps,
  registryLookupUrl,
  setOccupationApproval,
  setRegistryStatus,
  stepStatuses,
  type AdminDocument,
  type AdminOccupation,
} from '../../services/admin';
import { ActionButton } from './ConfirmAction';
import { REGISTRY_STATUS_LABELS, REGISTRY_STATUS_STYLES, STEP_STATE_LABELS, STEP_STATE_STYLES } from './labels';
import { linkClass } from './styles';
import { Badge, Card } from './ui';

/**
 * One occupation of a provider: the registry the provider informed, what the policy asks for and where
 * each document stands, the registry decision and the approval of the occupation (which is separate
 * from the approval of the provider).
 */
const OccupationCard: React.FC<{ occupation: AdminOccupation; documents: AdminDocument[]; onChanged: () => void }> = ({
  occupation: occ,
  documents,
  onChanged,
}) => {
  const policy = occ.policy;
  const name = occ.name;
  const lookup = registryLookupUrl(policy);
  const steps = stepStatuses(policy, documents);
  const missing = missingSteps(policy, documents);
  const check = approvalCheck(occ, documents);
  const hasRegistry = occ.registry_status !== 'not_required';
  const registryName = policy?.registry_name || 'registro';
  const sources = (policy?.sources ?? []).filter(url => /^https?:\/\//.test(url));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Badge className={occ.approved ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
          {occ.approved ? 'Ocupação aprovada' : 'Ocupação a aprovar'}
        </Badge>
        {occ.is_primary && <Badge className="bg-purple-100 text-purple-800">Principal</Badge>}
        <Badge className={REGISTRY_STATUS_STYLES[occ.registry_status]}>{REGISTRY_STATUS_LABELS[occ.registry_status]}</Badge>
      </div>
      <h3 className="font-semibold text-gray-900 break-words">{name}</h3>

      {hasRegistry && (
        <dl className="text-sm text-gray-700 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-gray-500">{registryName} informado</dt>
          <dd className="break-words">
            {occ.registry_number ? `${occ.registry_number}${occ.registry_uf ? `/${occ.registry_uf}` : ''}` : 'Sem número'}
          </dd>
          {policy?.regulator_body && (
            <>
              <dt className="text-gray-500">Conselho ou órgão</dt>
              <dd className="break-words">{policy.regulator_body}</dd>
            </>
          )}
          {policy?.legal_basis && (
            <>
              <dt className="text-gray-500">Base legal</dt>
              <dd className="break-words">{policy.legal_basis}</dd>
            </>
          )}
        </dl>
      )}
      {hasRegistry && (
        <p className="text-xs text-gray-500 mt-2">
          O número é informado pelo prestador. Ele só passa a &quot;confirmado pelo WorkEasy&quot; depois que uma pessoa da administração consulta o
          conselho.
        </p>
      )}
      {(lookup || sources.length > 0) && (
        <ul className="text-sm mt-2 space-y-1">
          {lookup && (
            <li>
              <a href={lookup} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1`}>
                Buscar a consulta pública do {registryName} <ExternalLink size={14} aria-hidden="true" />
              </a>
              <span className="block text-xs text-gray-500">O número e o estado do prestador não vão para o buscador: copie o número acima na consulta do conselho.</span>
            </li>
          )}
          {sources.map(url => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1 break-all`}>
                Fonte da política <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">: {url}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <h4 className="text-sm font-semibold text-gray-800">Documentos que a política exige</h4>
        {steps.length === 0 ? (
          <p className="text-sm text-gray-600 mt-1">
            {policy ? 'A política desta ocupação não pede documento.' : 'Esta ocupação não tem política cadastrada, então o banco não pede documento.'}
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {steps.map(item => {
              const rejected = item.documents.find(d => d.status === 'rejected' && d.rejection_reason);
              return (
                <li key={item.step} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm text-gray-800 break-words">{VERIFICATION_LABELS[item.step] ?? item.step}</p>
                    {item.state === 'rejected' && rejected?.rejection_reason && (
                      <p className="text-xs text-gray-500 break-words">Motivo da rejeição: {rejected.rejection_reason}</p>
                    )}
                    {item.state === 'missing' && <p className="text-xs text-gray-500">O prestador ainda não enviou.</p>}
                    {item.state === 'submitted' && <p className="text-xs text-gray-500">Abra o arquivo em &quot;Documentos&quot; e aceite ou rejeite.</p>}
                  </div>
                  <Badge className={STEP_STATE_STYLES[item.state]}>{STEP_STATE_LABELS[item.state]}</Badge>
                </li>
              );
            })}
          </ul>
        )}
        {steps.length > 0 && missing.length === 0 && <p className="text-xs text-green-800 mt-2">Todos os documentos que a política pede estão aceitos.</p>}
        {occ.approved && missing.length > 0 && (
          <p role="status" className="text-xs text-amber-800 mt-2">
            Esta ocupação está aprovada, mas hoje falta documento aceito para: {missing.map(step => VERIFICATION_LABELS[step] ?? step).join('; ')}.
            Se o aceite foi desfeito por engano, aceite o documento de novo; senão, retire a aprovação.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {hasRegistry && occ.registry_status !== 'confirmed' && (
          <ActionButton
            label="Confirmar registro"
            tone="primary"
            title={`Confirmar o ${registryName}`}
            description={<p>Confirme só depois de consultar o conselho e conferir nome e situação. Anote como conferiu (por exemplo, a data da consulta).</p>}
            reason="required"
            reasonLabel="Como foi conferido (obrigatório)"
            confirmLabel="Confirmar registro"
            onConfirm={reason => setRegistryStatus(occ.provider_id, occ.occupation_slug, 'confirmed', reason)}
            onDone={onChanged}
          />
        )}
        {hasRegistry && occ.registry_status !== 'rejected' && (
          <ActionButton
            label="Rejeitar registro"
            tone="danger"
            title={`Rejeitar o ${registryName}`}
            description={<p>Com o registro rejeitado, esta ocupação sai da busca e deixa de receber pedidos.</p>}
            reason="required"
            confirmLabel="Rejeitar registro"
            onConfirm={reason => setRegistryStatus(occ.provider_id, occ.occupation_slug, 'rejected', reason)}
            onDone={onChanged}
          />
        )}
        {!occ.approved ? (
          <ActionButton
            label="Aprovar ocupação"
            tone="primary"
            title={`Aprovar ${name}`}
            description={
              <>
                <p>A ocupação passa a aparecer na busca e a receber pedidos e agendamentos.</p>
                {hasRegistry && occ.registry_status === 'informed' && (
                  <p>O registro ainda está só informado, não confirmado: confira no conselho antes, se a política pede.</p>
                )}
                <p>O banco confere de novo os documentos e o registro. Se recusar, a razão aparece aqui.</p>
              </>
            }
            reason="required"
            confirmLabel="Aprovar ocupação"
            disabled={!check.ok}
            hint={check.reason}
            onConfirm={reason => setOccupationApproval(occ.provider_id, occ.occupation_slug, true, reason)}
            onDone={onChanged}
          />
        ) : (
          <ActionButton
            label="Retirar aprovação"
            tone="danger"
            title={`Retirar a aprovação de ${name}`}
            description={<p>A ocupação sai da busca e deixa de receber pedidos e agendamentos.</p>}
            reason="required"
            confirmLabel="Retirar aprovação"
            onConfirm={reason => setOccupationApproval(occ.provider_id, occ.occupation_slug, false, reason)}
            onDone={onChanged}
          />
        )}
      </div>
    </Card>
  );
};

export default OccupationCard;
