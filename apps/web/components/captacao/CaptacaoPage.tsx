import React, { ReactNode } from 'react';
import { documentTitle, type StaticPage } from './content';
import { usePageTitle } from './usePageTitle';

/** Frame of an acquisition page: the tab title of its static entry and the reading width. */
const CaptacaoPage: React.FC<{ entry: StaticPage; children: ReactNode }> = ({ entry, children }) => {
  usePageTitle(documentTitle(entry.title));
  return <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">{children}</div>;
};

export default CaptacaoPage;
