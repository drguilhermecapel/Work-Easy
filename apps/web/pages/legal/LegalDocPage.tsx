import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import Markdown, { type MarkdownLinkProps } from '../../lib/markdown';
import { company, legalDocById, legalInForce, type LegalDocId } from '../../config/legal';
import { formatPhoneBR } from '../../lib/phone';
import { useAsync } from '../../lib/useAsync';
import CompanyDetails from '../../components/CompanyDetails';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { loadLegalSource } from './sources';
import { LEGAL_PROSE } from './prose';

/** In-app targets go through the router (the native shells use hash URLs); the rest are plain anchors. */
const renderLink = ({ href, external, className, children }: MarkdownLinkProps): ReactNode => {
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
};

const DocText: React.FC<{ id: LegalDocId }> = ({ id }) => {
  const text = useAsync(() => loadLegalSource(id), id);
  if (text.data === undefined) {
    if (!text.error) return <PageStatus />;
    return (
      <div className="space-y-3">
        <ErrorAlert error={text.error} />
        <button type="button" onClick={text.reload} className="text-sm font-semibold text-primary underline">
          Tentar de novo
        </button>
      </div>
    );
  }
  // The page prints the h1: a "#" title at the top of the file is left out (its "##" sections stay h2),
  // and a text without one starts its sections at "#", which becomes h2 as well
  return <Markdown source={text.data} headingOffset={1} skipFirstH1 minHeading={2} classNames={LEGAL_PROSE} renderLink={renderLink} />;
};

/** Where to reach customer service, from the build variables. */
const SacChannels: React.FC = () => {
  const { sacEmail, sacWhatsapp } = company();
  if (!sacEmail && !sacWhatsapp) return null;
  return (
    <section aria-labelledby="sac-canais" className="mt-8 bg-white border border-gray-100 rounded-2xl p-5 print:border-0 print:p-0">
      <h2 id="sac-canais" className="text-lg font-bold text-gray-900 mb-2">
        Canais de atendimento
      </h2>
      <ul className="space-y-1 text-gray-700">
        {sacEmail && (
          <li>
            E-mail:{' '}
            <a href={`mailto:${sacEmail}`} className="text-primary underline print:text-black">
              {sacEmail}
            </a>
          </li>
        )}
        {sacWhatsapp && (
          <li>
            WhatsApp:{' '}
            <a href={`https://wa.me/${sacWhatsapp}`} target="_blank" rel="noopener noreferrer" className="text-primary underline print:text-black">
              {formatPhoneBR(sacWhatsapp)}
            </a>
          </li>
        )}
      </ul>
    </section>
  );
};

/** One legal text: title and version from config/legal.ts, body from content/legal/<id>.md. */
const LegalDocPage: React.FC<{ id: LegalDocId }> = ({ id }) => {
  const doc = legalDocById(id);
  const inForce = legalInForce();

  return (
    <article className="max-w-3xl mx-auto px-4 py-8 min-h-screen print:max-w-none print:min-h-0 print:p-0">
      <nav aria-label="Caminho" className="mb-4 text-sm text-gray-500 print:hidden">
        <Link to="/legal" className="inline-flex items-center gap-1 hover:text-primary">
          <ChevronLeft size={14} aria-hidden="true" /> Documentos legais
        </Link>
      </nav>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{doc.title}</h1>
          <p className="text-sm text-gray-500 mt-1">Versão {doc.version}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
        >
          <Printer size={16} aria-hidden="true" /> Imprimir
        </button>
      </header>

      {!inForce && (
        <div
          role="note"
          className="bg-amber-50 border border-amber-100 text-amber-900 rounded-xl p-4 text-sm mb-6 print:border-black print:bg-transparent print:text-black"
        >
          <strong>Rascunho em revisão jurídica.</strong> Este texto ainda não foi aprovado por advogado e pode mudar antes de passar a valer.
        </div>
      )}

      <DocText id={id} />

      {id === 'sac' && <SacChannels />}
      <CompanyDetails channels={id !== 'sac'} className="mt-10 pt-4 border-t border-gray-200 text-sm text-gray-600 print:text-black" />
    </article>
  );
};

export default LegalDocPage;
