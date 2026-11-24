import React from 'react';
import { useHandoffPending, useHandoffReady } from '../lib/staticHandoff';

// Markers for the handoff from the static HTML to the React tree (lib/staticHandoff.ts). They render nothing.

/** In the Suspense boundary of the routes: says that the page of the route is in. */
export const HandoffReady: React.FC = () => {
  useHandoffReady();
  return null;
};

/** In the fallback of a boundary inside a page: while it shows, the static page, which has that content, stays. */
export const HandoffPending: React.FC = () => {
  useHandoffPending();
  return null;
};
