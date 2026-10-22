import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { UserType, UserProfile } from '../types';
import { supabase, type AppSupabaseClient } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fetchIsAdmin, getMyProvider, getProfile } from '../services/account';
import { clearRequestDraft } from '../lib/requestDraft';
import { sendOtp, signOut as signOutService, verifyOtp as verifyOtpService, type OtpTarget } from '../services/auth';
import type { ProfileRow, ProviderRow } from '../services/types';

export type { OtpTarget };

interface AuthCommon {
  /**
   * The demo persona shown by the demo screens (Navbar, Dashboard, prontuário,
   * teleconsulta), switched by the role selector. Always fictitious, also with
   * a backend, so those screens never put mock data under a real person's name.
   * The real account is `authUser` / `profile` (mode 'backend').
   */
  user: UserProfile;
  /** Demo role switcher (changes only the demo persona). */
  switchRole: (role: UserType, isHealth?: boolean) => void;
  /** Demo: always true. Backend: there is a Supabase session. */
  isAuthenticated: boolean;
  /** True until the stored session (and then the profile) has been read. Always false in the demo. */
  loading: boolean;
}

/** No backend: fictitious data only; the account fields do not exist. */
export interface DemoAuth extends AuthCommon {
  mode: 'demo';
  session?: undefined;
  authUser?: undefined;
  profile?: undefined;
  provider?: undefined;
  isAdmin?: undefined;
  signInWithOtp?: undefined;
  verifyOtp?: undefined;
  signOut?: undefined;
  refreshProfile?: undefined;
}

/** Supabase configured: real session. Check `mode === 'backend'` and the functions are always there. */
export interface BackendAuth extends AuthCommon {
  mode: 'backend';
  session: Session | null;
  /** The Supabase Auth user (docs/ARQUITETURA.md calls it `user`; here `user` stays the demo persona). */
  authUser: User | null;
  profile: ProfileRow | null;
  provider: ProviderRow | null;
  isAdmin: boolean;
  signInWithOtp: (target: OtpTarget) => Promise<void>;
  /** Resolves to the signed-in user id. */
  verifyOtp: (target: OtpTarget, code: string) => Promise<string | null>;
  /** Ends the session and clears what this browser kept for the user (the request draft). */
  signOut: () => Promise<void>;
  /** Reloads profile, provider and admin flag (e.g. after editing the profile). */
  refreshProfile: () => void;
}

export type AuthContextType = DemoAuth | BackendAuth;

// Mock Users
const MOCK_CLIENT: UserProfile = {
  id: 'user-123',
  name: 'Maria Cliente',
  type: UserType.CLIENT,
  isHealthProfessional: false,
};

const MOCK_PROVIDER: UserProfile = {
  id: 'prov-456',
  name: 'João Pintor',
  type: UserType.PROVIDER,
  isHealthProfessional: false,
};

const MOCK_DOCTOR: UserProfile = {
  id: 'doc-789',
  name: 'Dr. Roberto Costa',
  type: UserType.PROVIDER,
  isHealthProfessional: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Role switcher of the demo persona (also used by the demo screens when there is a backend). */
const useDemoPersona = () => {
  const [user, setUser] = useState<UserProfile>(MOCK_CLIENT);
  const switchRole = useCallback((role: UserType, isHealth: boolean = false) => {
    if (role === UserType.CLIENT) {
      setUser(MOCK_CLIENT);
    } else if (isHealth) {
      setUser(MOCK_DOCTOR);
    } else {
      setUser(MOCK_PROVIDER);
    }
  }, []);
  return { user, switchRole };
};

/** Demo mode: unchanged role switcher with fictitious users. */
const DemoAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, switchRole } = useDemoPersona();
  const value = useMemo<DemoAuth>(() => ({ user, switchRole, isAuthenticated: true, loading: false, mode: 'demo' }), [user, switchRole]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

interface AccountDetails {
  profile: ProfileRow | null;
  provider: ProviderRow | null;
  isAdmin: boolean;
}

const NO_DETAILS: AccountDetails = { profile: null, provider: null, isAdmin: false };

const loadDetails = async (userId: string | undefined): Promise<AccountDetails> => {
  if (!userId) return NO_DETAILS;
  // Each part may fail on its own (e.g. RLS); the session stays usable
  const [profile, provider, isAdmin] = await Promise.allSettled([getProfile(userId), getMyProvider(userId), fetchIsAdmin()]);
  return {
    profile: profile.status === 'fulfilled' ? profile.value : null,
    provider: provider.status === 'fulfilled' ? provider.value : null,
    isAdmin: isAdmin.status === 'fulfilled' ? isAdmin.value : false,
  };
};

/** Backend mode: real Supabase Auth session, profile, provider record and admin flag. */
const BackendAuthProvider: React.FC<{ client: AppSupabaseClient; children: ReactNode }> = ({ client, children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(
      ({ data }) => {
        if (!active) return;
        setSession(data.session);
        setSessionReady(true);
      },
      () => active && setSessionReady(true),
    );
    // No other Supabase call inside this callback: auth-js holds a lock while it runs
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      // Also covers a session ended elsewhere (another tab, expiry)
      if (event === 'SIGNED_OUT') clearRequestDraft();
      setSession(next);
      setSessionReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const authUser = session?.user ?? null;
  const userId = authUser?.id;
  const details = useAsync(() => loadDetails(userId), userId ?? 'anonymous');
  const { profile, provider, isAdmin } = details.data ?? NO_DETAILS;

  const signInWithOtp = useCallback((target: OtpTarget) => sendOtp(target), []);
  const verifyOtp = useCallback((target: OtpTarget, code: string) => verifyOtpService(target, code), []);
  const signOut = useCallback(async () => {
    clearRequestDraft();
    await signOutService();
  }, []);
  const { user, switchRole } = useDemoPersona();

  const value = useMemo<BackendAuth>(() => {
    return {
      user,
      switchRole,
      isAuthenticated: authUser !== null,
      mode: 'backend',
      loading: !sessionReady || (userId !== undefined && details.loading && !details.data),
      session,
      authUser,
      profile,
      provider,
      isAdmin,
      signInWithOtp,
      verifyOtp,
      signOut,
      refreshProfile: details.reload,
    };
  }, [user, switchRole, authUser, userId, profile, provider, isAdmin, session, sessionReady, details.loading, details.data, details.reload, signInWithOtp, verifyOtp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
  supabase ? <BackendAuthProvider client={supabase}>{children}</BackendAuthProvider> : <DemoAuthProvider>{children}</DemoAuthProvider>;

// The hook lives next to its provider on purpose; fast refresh still works for the provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
