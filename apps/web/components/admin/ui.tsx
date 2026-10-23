import React, { ReactNode } from 'react';
import { describeControl } from '../fieldA11y';
import FieldError from '../FieldError';
import { cardClass, secondaryButton } from './styles';

export const Card: React.FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${cardClass} ${className}`}>{children}</div>
);

export const Badge: React.FC<{ className: string; children: ReactNode }> = ({ className, children }) => (
  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-sm ${className}`}>{children}</span>
);

export const EmptyState: React.FC<{ children: ReactNode }> = ({ children }) => (
  <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl p-5">{children}</p>
);

/** Label + control + optional hint and error; `id` ties the label to the control, and the hint and the error are read with it. */
export const Field: React.FC<{ id: string; label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }> = ({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}) => (
  <div className={className}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    {describeControl(children, { hint: hint ? `${id}-hint` : undefined, error: error ? `${id}-erro` : undefined })}
    {hint && (
      <p id={`${id}-hint`} className="text-xs text-gray-500 mt-1">
        {hint}
      </p>
    )}
    {error && <FieldError id={`${id}-erro`}>{error}</FieldError>}
  </div>
);

/** Previous/next for lists read one page at a time. */
export const Pager: React.FC<{ page: number; hasMore: boolean; onPage: (page: number) => void; busy?: boolean }> = ({ page, hasMore, onPage, busy }) =>
  page === 0 && !hasMore ? null : (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className={secondaryButton} disabled={page === 0 || busy} onClick={() => onPage(page - 1)}>
        Página anterior
      </button>
      <span className="text-sm text-gray-600" aria-current="page">
        Página {page + 1}
      </span>
      <button type="button" className={secondaryButton} disabled={!hasMore || busy} onClick={() => onPage(page + 1)}>
        Próxima página
      </button>
    </nav>
  );
