import { createContext, useContext } from 'react';
import type { ProviderRow } from '../../services/types';

export interface ProContextValue {
  userId: string;
  /** Null until the user creates the provider record in /pro/cadastro. */
  provider: ProviderRow | null;
  /** Reads the provider record again (status and plan change on the server). */
  refresh: () => void;
}

export const ProContext = createContext<ProContextValue | null>(null);

export const usePro = (): ProContextValue => {
  const value = useContext(ProContext);
  if (!value) throw new Error('usePro must be used inside <ProPage>');
  return value;
};

/** For screens that ProPage only renders once the provider record exists. */
export const useProvider = (): ProContextValue & { provider: ProviderRow } => {
  const value = usePro();
  if (!value.provider) throw new Error('useProvider needs a provider record');
  return value as ProContextValue & { provider: ProviderRow };
};
