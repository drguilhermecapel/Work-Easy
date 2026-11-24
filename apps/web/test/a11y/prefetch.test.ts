import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_LOADERS, linkOf, prefetchRoute, routePathOf } from '../../components/routePrefetch';

describe('routePathOf', () => {
  it.each([
    ['/categorias', '/categorias'],
    ['/categorias/', '/categorias'],
    ['/servicos/diarista?x=1#topo', '/servicos/diarista'],
    ['#/pedido', '/pedido'],
    ['/', '/'],
  ])('reads %s as %s', (href, path) => expect(routePathOf(href)).toBe(path));

  it.each([null, '', 'https://example.com/entrar', '//example.com/entrar', 'mailto:a@b.c', '#topo', 'tel:+5511999999999'])(
    'ignores %s, which is not an in-app route',
    href => expect(routePathOf(href)).toBeNull(),
  );
});

describe('route loaders', () => {
  const loaderFor = (path: string) => ROUTE_LOADERS.find(([pattern]) => pattern.test(path));

  it.each(['/', '/categorias', '/categorias/limpeza', '/servicos/diarista', '/servicos/diarista/pinheiros', '/pedido', '/entrar', '/conta', '/pro/cadastro'])(
    'has a loader for %s',
    path => expect(loaderFor(path)).toBeDefined(),
  );

  it.each(['/pro', '/admin', '/p/ana', '/pedidos/1', '/servicos', '/categorias/a/b'])('has none for %s', path => expect(loaderFor(path)).toBeUndefined());
});

describe('prefetchRoute', () => {
  const load = vi.fn(() => Promise.resolve());
  const setConnection = (value: unknown) => Object.defineProperty(navigator, 'connection', { value, configurable: true });

  afterEach(() => {
    ROUTE_LOADERS.shift();
    load.mockClear();
    setConnection(undefined);
  });

  const register = (path: RegExp) => ROUTE_LOADERS.unshift([path, load]);

  it('loads a page once, however many times the pointer passes over its link', () => {
    register(/^\/teste-um$/);
    prefetchRoute('/teste-um');
    prefetchRoute('/teste-um?a=1');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing on the data saver or a 2g connection', () => {
    register(/^\/teste-dois$/);
    setConnection({ saveData: true });
    prefetchRoute('/teste-dois');
    setConnection({ effectiveType: '2g' });
    prefetchRoute('/teste-dois');
    expect(load).not.toHaveBeenCalled();
  });

  it('tries again later when a load fails', async () => {
    register(/^\/teste-tres$/);
    load.mockRejectedValueOnce(new Error('offline'));
    prefetchRoute('/teste-tres');
    await Promise.resolve();
    await Promise.resolve();
    prefetchRoute('/teste-tres');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('linkOf', () => {
  it('finds the link around the element under the pointer', () => {
    document.body.innerHTML = '<a href="/pedido"><span id="inner">Pedir</span></a><p id="plain">texto</p>';
    expect(linkOf(document.getElementById('inner'))).toBe('/pedido');
    expect(linkOf(document.getElementById('plain'))).toBeNull();
    expect(linkOf(null)).toBeNull();
    document.body.innerHTML = '';
  });
});
