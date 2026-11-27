import { useEffect, useState, type ReactNode } from 'react';
import { label } from './state';
import { secondaryButton } from '../../admin/styles';

export function Options({ codes }: { codes: string[] }) {
  return (
    <>
      {codes.map((code) => (
        <option value={code} key={code}>
          {label(code)}
        </option>
      ))}
    </>
  );
}
export function TaskButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={secondaryButton} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
export function RideDisplayMode() {
  const [simple, setSimple] = useState(() => {
    try {
      return localStorage.getItem('ride-simple') === 'on';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('ride-simple', simple);
    try {
      localStorage.setItem('ride-simple', simple ? 'on' : 'off');
    } catch {
      /* Storage may be unavailable in a private session. */
    }
    return () => document.documentElement.classList.remove('ride-simple');
  }, [simple]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-3">
      <button aria-pressed={simple} type="button" className={secondaryButton} onClick={() => setSimple(!simple)}>
        Modo simplificado {simple ? 'ativado' : 'desativado'}
      </button>
    </div>
  );
}
