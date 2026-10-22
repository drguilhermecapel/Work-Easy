import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageStatus from './PageStatus';

/** Backend screens for signed-in users: waits for the session, else sends to /entrar and back. */
const RequireSession: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageStatus />;
  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/entrar?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
};

export default RequireSession;
