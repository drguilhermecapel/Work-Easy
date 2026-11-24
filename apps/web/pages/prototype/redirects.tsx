import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageStatus from '../../components/PageStatus';
import { findOccupation } from '../../catalog';
import { useAuth } from '../../contexts/AuthContext';

/** /dashboard with a backend: the client's requests or the provider's panel, by session. */
export const DashboardRedirect: React.FC = () => {
  const auth = useAuth();
  if (auth.mode !== 'backend') return <Navigate to="/" replace />;
  // Until the session and the provider record are read, a provider would be sent to the client's list
  if (auth.loading) return <PageStatus />;
  // Visitors end up at /entrar through the session check of /pedidos
  return <Navigate to={auth.provider ? '/pro' : '/pedidos'} replace />;
};

/** /register-provider with a backend: the real onboarding, keeping the service chosen on a service page. */
export const RegisterProviderRedirect: React.FC = () => {
  const [params] = useSearchParams();
  const occupation = findOccupation(params.get('ocupacao'));
  return <Navigate to={occupation ? `/pro/cadastro?ocupacao=${encodeURIComponent(occupation.slug)}` : '/pro/cadastro'} replace />;
};
