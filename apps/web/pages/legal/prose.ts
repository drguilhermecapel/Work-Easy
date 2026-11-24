import type { MarkdownClassNames } from '../../lib/markdown';

/** Look of the legal texts: readable on screen, plain black on white when printed. */
export const LEGAL_PROSE: MarkdownClassNames = {
  h1: 'text-2xl font-bold text-gray-900 mt-8 mb-3',
  h2: 'text-xl font-bold text-gray-900 mt-8 mb-3 break-after-avoid',
  h3: 'text-lg font-semibold text-gray-900 mt-6 mb-2 break-after-avoid',
  h4: 'font-semibold text-gray-900 mt-4 mb-2 break-after-avoid',
  h5: 'font-semibold text-gray-800 mt-4 mb-1 break-after-avoid',
  h6: 'font-semibold text-gray-700 mt-4 mb-1 break-after-avoid',
  p: 'text-gray-700 leading-relaxed my-3 print:text-black',
  ul: 'list-disc pl-6 my-3 space-y-1 text-gray-700 print:text-black',
  ol: 'list-decimal pl-6 my-3 space-y-1 text-gray-700 print:text-black',
  li: 'leading-relaxed',
  blockquote: 'border-l-4 border-primary/40 bg-white pl-4 pr-3 py-1 my-4 text-gray-700 print:bg-transparent print:text-black',
  hr: 'my-8 border-gray-200',
  pre: 'bg-gray-100 rounded-lg p-3 my-4 overflow-x-auto text-sm',
  code: 'bg-gray-100 rounded-sm px-1 text-[0.9em]',
  tableWrap: 'overflow-x-auto my-4',
  table: 'w-full text-sm border-collapse',
  th: 'border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold print:bg-transparent',
  td: 'border border-gray-200 px-3 py-2 align-top',
  a: 'text-primary underline print:text-black',
  strong: 'font-semibold text-gray-900 print:text-black',
};
