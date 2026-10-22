import { useAuth } from '../../contexts/AuthContext';

/** Id of the signed-in user ('' in the demo mode or while the session loads); screens render only inside a session frame. */
export const useCareUserId = (): string => {
  const auth = useAuth();
  return auth.mode === 'backend' ? (auth.authUser?.id ?? '') : '';
};
