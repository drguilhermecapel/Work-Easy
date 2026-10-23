import React, { Fragment, useMemo, type ReactNode } from 'react';
import { parseMarkdown, type Align, type Block, type Inline } from './markdownParser';

// Renders the tree of lib/markdownParser.ts as React elements. Every piece of
// text goes through React (which escapes it) and links carry only hrefs that
// the parser accepted, so no raw HTML injection API is involved anywhere.

export type MarkdownElement =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'p' | 'ul' | 'ol' | 'li' | 'blockquote' | 'hr' | 'pre' | 'code'
  | 'table' | 'tableWrap' | 'th' | 'td'
  | 'a' | 'strong' | 'em';

export type MarkdownClassNames = Partial<Record<MarkdownElement, string>>;

export interface MarkdownLinkProps {
  href: string;
  /** http or https: opens outside the app. */
  external: boolean;
  className?: string;
  children: ReactNode;
}

export interface MarkdownProps {
  source: string;
  /** Heading levels move down by this much (1: "#" becomes h2); the result stops at h6. */
  headingOffset?: number;
  /** Leaves out the first block when it is a "#" heading (the page already shows the title). */
  skipFirstH1?: boolean;
  /** Tailwind classes per element. */
  classNames?: MarkdownClassNames;
  /** Draws links; the default is a plain anchor. Pass the router's Link for in-app targets. */
  renderLink?: (props: MarkdownLinkProps) => ReactNode;
}

interface Context {
  classes: MarkdownClassNames;
  headingOffset: number;
  renderLink?: MarkdownProps['renderLink'];
}

const alignStyle = (align: Align): React.CSSProperties | undefined => (align ? { textAlign: align } : undefined);

const renderInline = (nodes: Inline[], ctx: Context): ReactNode[] =>
  nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'code':
        return <code key={index} className={ctx.classes.code}>{node.value}</code>;
      case 'br':
        return <br key={index} />;
      case 'em':
        return <em key={index} className={ctx.classes.em}>{renderInline(node.children, ctx)}</em>;
      case 'strong':
        return <strong key={index} className={ctx.classes.strong}>{renderInline(node.children, ctx)}</strong>;
      case 'link': {
        const external = /^https?:/i.test(node.href);
        const children = renderInline(node.children, ctx);
        if (ctx.renderLink) {
          return <Fragment key={index}>{ctx.renderLink({ href: node.href, external, className: ctx.classes.a, children })}</Fragment>;
        }
        return external ? (
          <a key={index} href={node.href} className={ctx.classes.a} target="_blank" rel="noopener noreferrer">{children}</a>
        ) : (
          <a key={index} href={node.href} className={ctx.classes.a}>{children}</a>
        );
      }
    }
  });

const renderBlocks = (blocks: Block[], ctx: Context, tight = false): ReactNode[] =>
  blocks.map((block, index) => {
    switch (block.type) {
      case 'heading': {
        const Tag = `h${Math.min(6, block.level + ctx.headingOffset)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
        return <Tag key={index} className={ctx.classes[Tag]}>{renderInline(block.children, ctx)}</Tag>;
      }
      case 'paragraph':
        return tight ? (
          <Fragment key={index}>{renderInline(block.children, ctx)}</Fragment>
        ) : (
          <p key={index} className={ctx.classes.p}>{renderInline(block.children, ctx)}</p>
        );
      case 'blockquote':
        return <blockquote key={index} className={ctx.classes.blockquote}>{renderBlocks(block.children, ctx)}</blockquote>;
      case 'list': {
        const items = block.items.map((item, i) => (
          <li key={i} className={ctx.classes.li}>{renderBlocks(item, ctx, block.tight)}</li>
        ));
        return block.ordered ? (
          <ol key={index} className={ctx.classes.ol} start={block.start !== 1 ? block.start : undefined}>{items}</ol>
        ) : (
          <ul key={index} className={ctx.classes.ul}>{items}</ul>
        );
      }
      case 'code':
        return <pre key={index} className={ctx.classes.pre}><code>{block.value}</code></pre>;
      case 'hr':
        return <hr key={index} className={ctx.classes.hr} />;
      case 'table':
        return (
          <div key={index} className={ctx.classes.tableWrap}>
            <table className={ctx.classes.table}>
              <thead>
                <tr>
                  {block.header.map((cell, col) => (
                    <th key={col} scope="col" className={ctx.classes.th} style={alignStyle(block.align[col])}>{renderInline(cell, ctx)}</th>
                  ))}
                </tr>
              </thead>
              {block.rows.length > 0 && (
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, col) => (
                        <td key={col} className={ctx.classes.td} style={alignStyle(block.align[col])}>{renderInline(cell, ctx)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
    }
  });

/** Markdown text as React elements. Safe for any source: see lib/markdownParser.ts. */
const Markdown: React.FC<MarkdownProps> = ({ source, headingOffset = 0, skipFirstH1 = false, classNames = {}, renderLink }) => {
  const blocks = useMemo(() => {
    const parsed = parseMarkdown(source);
    const first = parsed[0];
    return skipFirstH1 && first?.type === 'heading' && first.level === 1 ? parsed.slice(1) : parsed;
  }, [source, skipFirstH1]);
  return <>{renderBlocks(blocks, { classes: classNames, headingOffset, renderLink })}</>;
};

export default Markdown;
