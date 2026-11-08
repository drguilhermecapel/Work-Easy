import { afterEach, describe, expect, it, vi } from 'vitest';
import { externalLinkProps, openExternalLink, parseExternalUrl } from '../../platform/external';

describe('platform/external: allow-list', () => {
  it('accepts WhatsApp, web, phone and e-mail links', () => {
    expect(parseExternalUrl('https://wa.me/5511999999999?text=Ol%C3%A1')?.protocol).toBe('https:');
    expect(parseExternalUrl('http://example.org/pagina')?.protocol).toBe('http:');
    expect(parseExternalUrl('tel:+5511999999999')?.protocol).toBe('tel:');
    expect(parseExternalUrl('mailto:contato@workeasy.example')?.protocol).toBe('mailto:');
  });

  it('refuses schemes that could run code or open other apps', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'intent://scan/#Intent;scheme=zxing;end',
      'file:///etc/passwd',
      'ftp://example.org/arquivo',
      'capacitor://localhost/index.html',
    ]) {
      expect(parseExternalUrl(raw), raw).toBeNull();
    }
  });

  it('refuses relative paths, empty values and malformed text', () => {
    expect(parseExternalUrl('/pedido')).toBeNull();
    expect(parseExternalUrl('wa.me/5511999999999')).toBeNull();
    expect(parseExternalUrl('')).toBeNull();
    expect(parseExternalUrl(null)).toBeNull();
    expect(parseExternalUrl(undefined)).toBeNull();
    expect(parseExternalUrl('https://')).toBeNull();
  });

  it('refuses web links that carry credentials', () => {
    expect(parseExternalUrl('https://wa.me@evil.example/')).toBeNull();
    expect(parseExternalUrl('https://user:senha@wa.me/5511999999999')).toBeNull();
  });

  it('trims surrounding spaces before checking', () => {
    expect(parseExternalUrl('  https://wa.me/5511999999999  ')?.href).toBe('https://wa.me/5511999999999');
  });
});

describe('platform/external: anchor props', () => {
  it('gives web links rel="noopener noreferrer" and a new tab', () => {
    expect(externalLinkProps('https://wa.me/5511999999999?text=oi')).toEqual({
      href: 'https://wa.me/5511999999999?text=oi',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('does not open a new tab for tel: and mailto: links', () => {
    expect(externalLinkProps('tel:+5511999999999')).toEqual({ href: 'tel:+5511999999999' });
    expect(externalLinkProps('mailto:contato@workeasy.example')).toEqual({ href: 'mailto:contato@workeasy.example' });
  });

  it('returns null when the link must not be rendered', () => {
    expect(externalLinkProps('javascript:void(0)')).toBeNull();
    expect(externalLinkProps(undefined)).toBeNull();
  });
});

describe('platform/external: openExternalLink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens web links in a new window with noopener and noreferrer', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(openExternalLink('https://wa.me/5511999999999')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://wa.me/5511999999999', '_blank', 'noopener,noreferrer');
  });

  it('hands tel: and mailto: links to the browser without a new window', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const assign = vi.fn();
    const location = window.location;
    // jsdom does not navigate; the href setter is replaced to observe the call
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...location, set href(value: string) { assign(value); } },
    });
    try {
      expect(openExternalLink('tel:+5511999999999')).toBe(true);
      expect(assign).toHaveBeenCalledWith('tel:+5511999999999');
      expect(open).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
    }
  });

  it('does nothing and reports false for a refused link', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(openExternalLink('javascript:alert(1)')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
