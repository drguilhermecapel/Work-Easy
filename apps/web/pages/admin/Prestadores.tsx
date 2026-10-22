import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { formatDateTime } from '../../components/admin/format';
import { PROVIDER_STATUS_LABELS, PROVIDER_STATUS_STYLES } from '../../components/admin/labels';
import { inputClass, primaryButton } from '../../components/admin/styles';
import { Badge, EmptyState, Field, Pager } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { listProviders, PROVIDER_LIST_FILTERS, type ProviderListFilter, type ProviderListRow } from '../../services/admin';

const FILTER_LABELS: Record<ProviderListFilter, string> = {
  queue: 'Fila de análise',
  all: 'Todos',
  pending_review: 'Em análise',
  approved: 'Aprovados',
  suspended: 'Suspensos',
  draft: 'Rascunhos',
};

const EMPTY_TEXT: Record<ProviderListFilter, string> = {
  queue: 'Nenhum prestador esperando análise.',
  all: 'Nenhum prestador cadastrado.',
  pending_review: 'Nenhum prestador em análise.',
  approved: 'Nenhum prestador aprovado.',
  suspended: 'Nenhum prestador suspenso.',
  draft: 'Nenhum cadastro em rascunho.',
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const pending = (row: ProviderListRow): string[] =>
  [
    row.review && row.review.documents_submitted > 0 && count(row.review.documents_submitted, 'documento a revisar', 'documentos a revisar'),
    row.review && row.review.registries_to_review > 0 && count(row.review.registries_to_review, 'registro a conferir', 'registros a conferir'),
    row.occupations_to_approve > 0 && count(row.occupations_to_approve, 'ocupação a aprovar', 'ocupações a aprovar'),
  ].filter((text): text is string => Boolean(text));

const Prestadores: React.FC = () => {
  const [filter, setFilter] = useState<ProviderListFilter>('queue');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const list = useAsync(() => listProviders({ filter, search, page }), `${filter}|${search}|${page}`);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(typed.trim());
    setPage(0);
  };

  const rows = list.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Prestadores</h1>
        <p className="text-sm text-gray-500 mt-1">
          A fila de análise traz cadastros em análise e prestadores aprovados com ocupação ainda a aprovar, do mais antigo ao mais novo. Os outros filtros
          listam todos os prestadores, por nome.
        </p>
      </header>

      <form role="search" aria-label="Buscar prestadores" onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl p-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <Field id="prestadores-busca" label="Buscar pelo nome" hint="Parte do nome do prestador, sem diferenciar maiúsculas.">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              id="prestadores-busca"
              type="search"
              autoComplete="off"
              value={typed}
              maxLength={80}
              aria-describedby="prestadores-busca-hint"
              onChange={event => setTyped(event.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
        </Field>
        <Field id="prestadores-situacao" label="Situação">
          <select
            id="prestadores-situacao"
            value={filter}
            onChange={event => {
              setFilter(event.target.value as ProviderListFilter);
              setPage(0);
            }}
            className={inputClass}
          >
            {PROVIDER_LIST_FILTERS.map(option => (
              <option key={option} value={option}>
                {FILTER_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className={`${primaryButton} sm:mb-[1.35rem]`}>
          Buscar
        </button>
      </form>

      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <PageStatus />
      ) : (
        <>
          {list.data && rows.length === 0 && (
            <EmptyState>{search ? `Nenhum prestador encontrado para "${search}" neste filtro.` : EMPTY_TEXT[filter]}</EmptyState>
          )}
          <ul className="space-y-3" aria-busy={list.loading}>
            {rows.map(row => (
              <li key={row.id}>
                <Link
                  to={`/admin/prestadores/${row.id}`}
                  className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge className={PROVIDER_STATUS_STYLES[row.status]}>{PROVIDER_STATUS_LABELS[row.status]}</Badge>
                      <span className="text-xs text-gray-500">Cadastro em {formatDateTime(row.created_at)}</span>
                    </div>
                    <p className="font-bold text-gray-900 break-words">{row.display_name}</p>
                    {row.full_name && row.full_name !== row.display_name && <p className="text-sm text-gray-600 break-words">{row.full_name}</p>}
                    <p className="text-sm text-gray-600 break-words">{row.occupations.map(o => o.name).join(', ') || 'Sem ocupação'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {pending(row).join(' · ') || 'Nada a aprovar nem a revisar'}
                      {row.review && ` · ${row.review.documents_accepted} aceitos, ${row.review.documents_rejected} rejeitados`}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {list.data && <Pager page={list.data.page} hasMore={list.data.hasMore} busy={list.loading} onPage={setPage} />}
        </>
      )}
    </div>
  );
};

export default Prestadores;
