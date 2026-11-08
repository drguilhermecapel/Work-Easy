/* eslint-disable react-refresh/only-export-components -- route table: the lazy pages are not exported */
import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { LEGAL_DOCS } from '../../config/legal';

const LegalDocs = lazy(() => import('../LegalDocs'));
const LegalDocPage = lazy(() => import('./LegalDocPage'));

/** Legal texts, placed inside <Routes> in AppShell.tsx: the /legal index and one route per document of config/legal.ts. */
export const legalRoutes = (
  <>
    <Route path="/legal" element={<LegalDocs />} />
    {LEGAL_DOCS.map(doc => (
      <Route key={doc.id} path={doc.route} element={<LegalDocPage id={doc.id} />} />
    ))}
  </>
);
