import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

/** Shown by screens that need the backend when the app runs in demo mode (or a feature is not configured). */
const BackendNotice: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="max-w-xl mx-auto px-4 py-12">
    <div role="note" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <Info size={20} className="text-primary shrink-0" aria-hidden="true" /> {title}
      </h1>
      <div className="text-sm text-gray-600 mt-3 space-y-2">{children}</div>
      <div className="flex flex-wrap gap-3 mt-5">
        <Link to="/categorias" className="text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700">
          Ver categorias
        </Link>
        <Link to="/" className="text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50">
          Voltar ao início
        </Link>
      </div>
    </div>
  </div>
);

export default BackendNotice;
