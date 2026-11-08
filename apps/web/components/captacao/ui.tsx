import React, { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { card } from './styles';

// Building blocks of the acquisition pages. Heading levels are fixed here so the
// outline stays in order: Hero has the only h1, Section the h2, Steps/InfoCard/FeatureGrid the h3.

/** Top of a page: the only h1, the opening paragraph and the calls to action. */
export const Hero: React.FC<{ title: string; lead: string; children?: ReactNode }> = ({ title, lead, children }) => (
  <header className="space-y-4">
    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h1>
    <p className="text-base text-gray-700 leading-relaxed max-w-3xl">{lead}</p>
    {children}
  </header>
);

/** A titled block of the page; `lead` is the paragraph of data/static-pages.json that opens it. */
export const Section: React.FC<{ id: string; title: string; lead?: string; children?: ReactNode }> = ({ id, title, lead, children }) => (
  <section aria-labelledby={id} className="space-y-4">
    <h2 id={id} className="text-xl font-bold text-gray-800">
      {title}
    </h2>
    {lead && <p className="text-sm text-gray-700 leading-relaxed max-w-3xl">{lead}</p>}
    {children}
  </section>
);

/** Numbered steps; the badge is decoration, the list itself carries the order. */
export const Steps: React.FC<{ items: Array<{ title: string; text: ReactNode }> }> = ({ items }) => (
  <ol role="list" className="space-y-3">
    {items.map((item, index) => (
      <li key={item.title} className={`${card} flex gap-4`}>
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center"
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800">{item.title}</h3>
          <p className="text-sm text-gray-700 mt-1">{item.text}</p>
        </div>
      </li>
    ))}
  </ol>
);

/** Small cards with an icon, a title and one sentence. */
export const FeatureGrid: React.FC<{ items: Array<{ icon: LucideIcon; title: string; text: string }> }> = ({ items }) => (
  <ul role="list" className="grid sm:grid-cols-2 gap-3">
    {items.map(({ icon: Icon, title, text }) => (
      <li key={title} className={card}>
        <Icon size={20} className="text-primary mb-2" aria-hidden="true" />
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-700 mt-1">{text}</p>
      </li>
    ))}
  </ul>
);

/** A card with a title, for side-by-side explanations. */
export const InfoCard: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className={card}>
    <h3 className="font-semibold text-gray-800">{title}</h3>
    <div className="text-sm text-gray-700 mt-2 space-y-2">{children}</div>
  </div>
);

export const BulletList: React.FC<{ items: ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-800">
    {items.map((item, index) => (
      <li key={index}>{item}</li>
    ))}
  </ul>
);

/** Term and value rows; `busy` tells assistive technology the values are still being read. */
export const FactList: React.FC<{ rows: Array<{ term: string; value: ReactNode }>; busy?: boolean }> = ({ rows, busy = false }) => (
  <dl aria-busy={busy} className={`${card} divide-y divide-gray-100`}>
    {rows.map(row => (
      <div key={row.term} className="py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-3 sm:gap-4">
        <dt className="text-sm font-medium text-gray-600">{row.term}</dt>
        <dd className="text-sm text-gray-800 mt-1 sm:mt-0 sm:col-span-2">{row.value}</dd>
      </div>
    ))}
  </dl>
);

/** A short remark that is not part of the flow of the page (state of the demo, an emergency number). */
export const Notice: React.FC<{ children: ReactNode; tone?: 'info' | 'alert' }> = ({ children, tone = 'info' }) => (
  <div
    role="note"
    className={`flex items-start gap-2 rounded-xl border p-3 text-sm text-gray-800 ${
      tone === 'alert' ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
    }`}
  >
    <Info size={16} className="shrink-0 mt-0.5 text-gray-600" aria-hidden="true" />
    <p>{children}</p>
  </div>
);

/** Questions that open on demand; the native element keeps the keyboard and screen reader behaviour. */
export const Faq: React.FC<{ items: Array<{ question: string; answer: ReactNode }> }> = ({ items }) => (
  <div className="space-y-2">
    {items.map(item => (
      <details key={item.question} className={card}>
        <summary className="cursor-pointer font-semibold text-gray-800">{item.question}</summary>
        <div className="mt-3 text-sm text-gray-700 space-y-2">{item.answer}</div>
      </details>
    ))}
  </div>
);
