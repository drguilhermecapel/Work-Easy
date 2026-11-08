import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_DOCS, company } from '../config/legal';
import { useAuth } from '../contexts/AuthContext';
import CompanyDetails from './CompanyDetails';

const LINK = 'hover:text-primary';

/**
 * Footer of every page. Demo mode keeps the prototype notice; with a backend it
 * identifies the company (build variables, see config/legal.ts) and links the
 * legal texts, the SAC and the way to join as a professional.
 */
const SiteFooter: React.FC = () => {
  const demo = useAuth().mode === 'demo';

  return (
    <footer className="bg-white border-t border-gray-200 py-8 mt-10 print:hidden">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-xl font-bold text-primary mb-2">WorkEasy</h2>
        <p className="text-gray-500 text-sm mb-4">Conectando quem precisa com quem sabe fazer.</p>
        {demo ? (
          <>
            <nav aria-label="Rodapé" className="flex justify-center gap-4 text-xs text-gray-400 mb-4">
              <Link to="/termos" className={LINK}>Termos de Uso</Link>
              <Link to="/privacidade" className={LINK}>Privacidade</Link>
              <Link to="/register-provider" className={LINK}>Trabalhe Conosco</Link>
            </nav>
            <p className="text-gray-400 text-xs">© 2026 WorkEasy. Protótipo de demonstração. Todos os direitos reservados.</p>
          </>
        ) : (
          <>
            <nav aria-label="Rodapé" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-gray-500 mb-4">
              {LEGAL_DOCS.map(doc => (
                <Link key={doc.id} to={doc.route} className={LINK}>
                  {doc.label}
                </Link>
              ))}
              <Link to="/pro/cadastro" className={LINK}>Trabalhe conosco</Link>
            </nav>
            <CompanyDetails className="text-xs text-gray-500 space-y-0.5 mb-3" />
            <p className="text-gray-400 text-xs">© {new Date().getFullYear()} {company().name ?? 'WorkEasy'}. Todos os direitos reservados.</p>
          </>
        )}
      </div>
    </footer>
  );
};

export default SiteFooter;
