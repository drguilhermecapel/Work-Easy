import React from 'react';

/** Loading line used while a screen reads its data. */
const PageStatus: React.FC<{ text?: string }> = ({ text = 'Carregando…' }) => (
  <div role="status" className="py-24 text-center text-gray-400 text-sm">{text}</div>
);

export default PageStatus;
