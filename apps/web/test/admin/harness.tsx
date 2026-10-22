/* eslint-disable react-refresh/only-export-components -- test helper module, not hot reloaded */
// Shared setup of the administration screen tests. Each test file calls
//   vi.mock('../../lib/supabase', async () => {
//     const { createAdminFake, current } = await import('./fake');
//     return { supabase: createAdminFake(() => current.world), backendEnabled: true };
//   });
// and then imports this module.
import React, { Suspense } from 'react';
import { configure, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { adminRoutes } from '../../pages/admin/routes';
import { adminRpcs, current, newWorld, type AdminFake, type AdminWorld } from './fake';

// The first render of a route loads its lazy chunk, which can take a while on a cold run
configure({ asyncUtilTimeout: 5000 });

export const fake = supabase as unknown as AdminFake;

/** Fresh world and fake client; signs in the world's user (an administrator unless overridden). */
export const resetWorld = (overrides: Partial<AdminWorld> = {}, signedIn = true): AdminWorld => {
  fake.reset();
  fake.ranges = [];
  fake.signedUrlCalls = [];
  const world = newWorld(overrides);
  current.world = world;
  fake.rpcs = adminRpcs(world);
  if (signedIn) fake.session = { access_token: 'test-token', user: { id: world.userId, email: 'admin@example.com' } };
  return world;
};

/** Shows where the guard sent the visitor. */
const Where: React.FC<{ name: string }> = ({ name }) => {
  const location = useLocation();
  return <p>{`${name}:${location.pathname}${location.search}`}</p>;
};

export const renderAdmin = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Routes>
            {adminRoutes}
            <Route path="/entrar" element={<Where name="entrar" />} />
            <Route path="/" element={<Where name="inicio" />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </AuthProvider>,
  );

/** Names of the rpcs called so far, in order. */
export const rpcNames = (): string[] => fake.rpcCalls.map(call => call.name);

/** Calls of one rpc other than is_admin (which the session itself makes). */
export const callsOf = (name: string) => fake.rpcCalls.filter(call => call.name === name);
