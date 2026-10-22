/* eslint-disable react-refresh/only-export-components -- route table: the lazy page is not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const Plantoes = lazy(() => import('../Plantoes'));

/** Caregiver side of the care line (/pro/plantoes), placed inside <Routes> in AppShell.tsx. */
export const plantoesRoutes = <Route path="/pro/plantoes" element={<Plantoes />} />;
