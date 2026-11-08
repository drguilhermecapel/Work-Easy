import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, MapPin } from 'lucide-react';
import { NOTICE, RULE_NOTE, SECTION, groupByZone } from '../../catalog/prose.mjs';
import type { OccupationSentences, ProseNeighborhood } from '../../catalog/prose.mjs';

// Building blocks of the four SEO routes (categories, area, occupation, occupation x neighborhood).
// scripts/prerender.mjs writes the same sections as static HTML, with the same sentences and class
// names, so what a crawler reads in the HTML is still on the page after React mounts
// (test/seo/hydration-parity.test.tsx compares the two).

export const Paragraph: React.FC<{ text: string }> = ({ text }) => <p className="text-sm text-gray-700 leading-relaxed">{text}</p>;

export const Paragraphs: React.FC<{ texts: readonly string[] }> = ({ texts }) => (
  <>
    {texts.map((text, index) => (
      <Paragraph key={`${index}-${text}`} text={text} />
    ))}
  </>
);

export const ProseSection: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3">
    <h2 className="font-bold text-gray-800 flex items-center gap-2">
      {icon}
      {title}
    </h2>
    {children}
  </section>
);

export const LinkList: React.FC<{ links: ReadonlyArray<{ to: string; label: string }> }> = ({ links }) => (
  <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
    {links.map(item => (
      <li key={item.to}>
        <Link to={item.to} className="inline-flex items-center max-sm:min-h-11 text-secondary hover:underline">
          {item.label}
        </Link>
      </li>
    ))}
  </ul>
);

/** The notice that closes every static page; the routes show it too. */
export const Notice: React.FC = () => <p className="text-xs text-gray-500">{NOTICE}</p>;

/** How it is hired, what is asked of the professional, whether the profession is regulated: the three sections of a service page. */
export const PolicySections: React.FC<{
  sentences: OccupationSentences;
  hiringTitle: string;
  requirementsTitle: string;
  /** Sources the policy cites, listed under the regulation section. */
  sources?: readonly string[];
}> = ({ sentences, hiringTitle, requirementsTitle, sources = [] }) => (
  <>
    <ProseSection title={hiringTitle} icon={<MapPin size={18} className="text-primary" />}>
      <Paragraphs texts={sentences.hiring} />
    </ProseSection>

    <ProseSection title={requirementsTitle} icon={<ClipboardList size={18} className="text-primary" />}>
      <p className="text-xs text-gray-500">{RULE_NOTE}</p>
      {sentences.steps.length > 0 && (
        <>
          <Paragraph text={sentences.stepsLead} />
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
            {sentences.steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </>
      )}
      <Paragraphs texts={sentences.requirements} />
    </ProseSection>

    <ProseSection title={SECTION.regulation}>
      <Paragraphs texts={sentences.regulation} />
      {sources.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">Fontes consultadas</summary>
          <ul className="mt-2 space-y-1 break-all">
            {sources.map(url => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block py-1.5 max-sm:py-3.75 text-secondary hover:underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </ProseSection>
  </>
);

/** Links from an occupation to its neighborhood pages, by zone. */
export const NeighborhoodLinks: React.FC<{ name: string; base: string; bairros: readonly ProseNeighborhood[] }> = ({ name, base, bairros }) => (
  <ProseSection title={SECTION.byNeighborhood(name)}>
    {groupByZone(bairros).map(group => (
      <React.Fragment key={group.zone}>
        <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
        <LinkList links={group.items.map(n => ({ to: `${base}/${n.slug}`, label: `${name} em ${n.name}` }))} />
      </React.Fragment>
    ))}
  </ProseSection>
);

/** One occupation as a card, as in the lists of the area page. */
export const OccupationCard: React.FC<{ to: string; name: string; badges: readonly string[] }> = ({ to, name, badges }) => (
  <Link
    to={to}
    className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 h-full hover:border-primary transition-colors"
  >
    <span className="min-w-0">
      <span className="block font-medium text-gray-800">{name}</span>
      {badges.map(badge => (
        <span key={badge} className="inline-block mt-1 mr-1 text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      ))}
    </span>
    <ChevronRight size={16} className="shrink-0 text-gray-500" />
  </Link>
);
