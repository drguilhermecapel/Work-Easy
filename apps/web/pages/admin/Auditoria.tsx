import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, shortId } from '../../components/admin/format';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { EmptyState, Field, Pager } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { auditProviderId, listAudit } from '../../services/admin';

// Entities the database writes today; the field also accepts any other name.
const KNOWN_ENTITIES = [
  'booking',
  'payment',
  'platform_setting',
  'provider',
  'provider_document',
  'provider_occupation',
  'user',
];

const Auditoria: React.FC = () => {
  const [draft, setDraft] = useState({ entity: '', actor: '' });
  const [applied, setApplied] = useState({ entity: '', actor: '' });
  const [page, setPage] = useState(0);
  const audit = useAsync(() => listAudit({ ...applied, page }), `${applied.entity}|${applied.actor}|${page}`);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied(draft);
    setPage(0);
  };
  const clear = () => {
    setDraft({ entity: '', actor: '' });
    setApplied({ entity: '', actor: '' });
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Auditoria</h1>
        <p className="text-sm text-gray-500 mt-1">Somente leitura, da ação mais nova para a mais antiga. O histórico não pode ser alterado nem apagado.</p>
      </header>

      <form onSubmit={apply} aria-label="Filtros da auditoria" className="bg-white border border-gray-100 rounded-2xl p-4 grid gap-3 sm:grid-cols-2">
        <Field id="aud-entidade" label="Entidade" hint="Por exemplo provider ou payment.">
          <input
            id="aud-entidade"
            type="text"
            list="aud-entidades"
            autoComplete="off"
            className={inputClass}
            value={draft.entity}
            onChange={e => setDraft({ ...draft, entity: e.target.value })}
          />
          <datalist id="aud-entidades">
            {KNOWN_ENTITIES.map(entity => (
              <option key={entity} value={entity} />
            ))}
          </datalist>
        </Field>
        <Field id="aud-ator" label="Ator (identificador do usuário)" hint="O identificador completo, como na lista de prestadores ou nesta lista.">
          <input
            id="aud-ator"
            type="text"
            autoComplete="off"
            className={inputClass}
            value={draft.actor}
            onChange={e => setDraft({ ...draft, actor: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className={primaryButton}>
            Filtrar
          </button>
          <button type="button" className={secondaryButton} onClick={clear}>
            Limpar filtros
          </button>
        </div>
      </form>

      <ErrorAlert error={audit.error} />
      {audit.loading && !audit.data && <PageStatus />}
      {audit.data && audit.data.rows.length === 0 && <EmptyState>Nenhuma entrada encontrada com estes filtros.</EmptyState>}
      {audit.data && (
        <ul className="space-y-3">
          {audit.data.rows.map(row => {
            const reason = typeof row.data.reason === 'string' ? row.data.reason : null;
            const providerId = auditProviderId(row.entity, row.entity_id);
            return (
              <li key={row.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs">
                <p className="font-semibold text-gray-900 break-all">{row.action}</p>
                <p className="text-xs text-gray-500">{formatDateTime(row.at)}</p>
                <dl className="text-sm text-gray-700 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500">Entidade</dt>
                  <dd className="break-all">
                    {row.entity}
                    {row.entity_id && <span title={row.entity_id}> · {row.entity_id.length > 24 ? shortId(row.entity_id) : row.entity_id}</span>}
                  </dd>
                  <dt className="text-gray-500">Ator</dt>
                  <dd className="break-words" title={row.actor_id ?? ''}>
                    {row.actor_id ? `${row.actor_name ?? 'Conta sem nome'} (${shortId(row.actor_id)})` : 'Sistema'}
                  </dd>
                  {reason && (
                    <>
                      <dt className="text-gray-500">Motivo</dt>
                      <dd className="whitespace-pre-line break-words">{reason}</dd>
                    </>
                  )}
                </dl>
                <details className="mt-2">
                  <summary className="text-sm text-primary cursor-pointer">Dados da ação</summary>
                  <pre className="text-xs bg-gray-50 rounded-lg p-3 mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(row.data, null, 2)}</pre>
                </details>
                {providerId && (
                  <p className="mt-2 text-sm">
                    <Link to={`/admin/prestadores/${providerId}`} className={linkClass}>
                      Abrir o prestador desta ação
                    </Link>
                  </p>
                )}
                {row.actor_id && (
                  <button
                    type="button"
                    className="text-xs text-primary underline mt-2"
                    onClick={() => {
                      const next = { ...applied, actor: row.actor_id ?? '' };
                      setDraft(next);
                      setApplied(next);
                      setPage(0);
                    }}
                  >
                    Ver só as ações deste ator
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {audit.data && <Pager page={page} hasMore={audit.data.hasMore} onPage={setPage} busy={audit.loading} />}
    </div>
  );
};

export default Auditoria;
