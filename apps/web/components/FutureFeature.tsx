import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';

export interface FutureFeatureLink {
  to: string;
  label: string;
}

/**
 * Page for something that does not exist yet. With a backend the prototype screens
 * of such features are not shown (their data is fictitious), this page says so instead.
 * The first link is the main way out.
 */
const FutureFeature: React.FC<{ title: string; links: FutureFeatureLink[]; children: ReactNode }> = ({ title, links, children }) => (
  <div className="max-w-xl mx-auto px-4 py-12">
    <section aria-labelledby="funcionalidade-futura" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">
        <Clock size={12} aria-hidden="true" /> Funcionalidade futura
      </p>
      <h1 id="funcionalidade-futura" className="text-xl font-bold text-gray-800 mt-3">{title}</h1>
      <div className="text-sm text-gray-600 mt-3 space-y-2">{children}</div>
      <div className="flex flex-wrap gap-3 mt-5">
        {links.map((link, index) => (
          <Link
            key={link.to}
            to={link.to}
            className={
              index === 0
                ? 'text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700'
                : 'text-sm font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50'
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  </div>
);

export default FutureFeature;
