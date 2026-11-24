import React from 'react';
import { Link } from 'react-router-dom';
import { card, linkClass } from './styles';
import type { StaticPageLink } from './content';

/** The "Veja também" links of data/static-pages.json, as the prerendered page lists them. */
const SeeAlso: React.FC<{ links: StaticPageLink[] }> = ({ links }) => (
  <nav aria-labelledby="ver-tambem" className={card}>
    <h2 id="ver-tambem" className="font-bold text-gray-800">
      Veja também
    </h2>
    <ul className="mt-3 space-y-1.5 text-sm">
      {links.map(item => (
        <li key={item.to}>
          <Link to={item.to} className={linkClass}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

export default SeeAlso;
