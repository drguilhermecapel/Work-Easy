/* eslint-disable react-refresh/only-export-components -- test helper, not a hot-reloaded module */
import { Suspense } from 'react';
import { configure, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { cuidadoRoutes } from '../../pages/cuidado/routes';
import { plantoesRoutes } from '../../pages/pro/plantoes/routes';

// Lazy route chunks, the session and the terms check load in sequence: give slow machines room
configure({ asyncUtilTimeout: 5000 });

const Where = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
};

/** Renders the real routes of the care line (family and caregiver) inside the auth provider; lib/supabase must be mocked by the test file. */
export const renderCare = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Routes>
            {cuidadoRoutes}
            {plantoesRoutes}
            <Route path="/entrar" element={<Where />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </AuthProvider>,
  );
