import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

// The SDK is mocked: the tests check what the app hands to it, not Sentry itself.
const sentry = vi.hoisted(() => ({
  load: vi.fn(),
  init: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/react', () => {
  sentry.load();
  return { init: sentry.init, captureException: sentry.captureException };
});

const DSN_KEY = 'pk7d3c1a9b0e2f4d6a8c0b2e4f6a8d0c2e';
const DSN = `https://${DSN_KEY}@o1234.ingest.de.sentry.io/98765`;

const loadModule = async () => {
  vi.resetModules();
  return import('../../lib/observability');
};

const asEvent = (value: Record<string, unknown>): ErrorEvent => value as unknown as ErrorEvent;

beforeEach(() => {
  sentry.load.mockReset();
  sentry.init.mockReset();
  sentry.captureException.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readObservabilityConfig', () => {
  it('is empty when the variables are unset', async () => {
    const { readObservabilityConfig } = await loadModule();
    expect(readObservabilityConfig({})).toEqual({ dsn: '', release: '' });
  });

  it('reads and trims both variables', async () => {
    const { readObservabilityConfig } = await loadModule();
    expect(readObservabilityConfig({ VITE_SENTRY_DSN: ` ${DSN} `, VITE_APP_VERSION: ' abc123 ' })).toEqual({
      dsn: DSN,
      release: 'abc123',
    });
  });
});

describe('scrubText', () => {
  it.each([
    ['e-mail', 'contato: ana.silva+x@exemplo.com.br', '[email]'],
    ['phone with DDD and parentheses', 'ligar (11) 99999-1234', '[telefone]'],
    ['phone with +55', 'WhatsApp +55 11 98888-7777', '[telefone]'],
    ['landline', 'fixo 11 3333-4444', '[telefone]'],
    ['phone with country code and no separators', 'tel 5511999991234', '[telefone]'],
    ['formatted CPF', 'CPF 123.456.789-09', '[cpf]'],
    ['bare CPF', 'documento 12345678909', '[cpf]'],
    ['formatted CNPJ', 'CNPJ 12.345.678/0001-95', '[cnpj]'],
    ['bare CNPJ', 'CNPJ 12345678000195', '[cnpj]'],
  ])('masks a %s', async (_label, input, mask) => {
    const { scrubText } = await loadModule();
    const output = scrubText(input);
    expect(output).toContain(mask);
    expect(output).not.toMatch(/\d{4}/);
    expect(output).not.toContain('@');
  });

  it('removes the query string and the fragment of an absolute URL', async () => {
    const { scrubText } = await loadModule();
    expect(scrubText('falha em https://app.example.com/pedido/1?token=abc&x=2#detalhe')).toBe(
      'falha em https://app.example.com/pedido/1',
    );
  });

  it('removes the query string and the fragment of a path', async () => {
    const { scrubText } = await loadModule();
    expect(scrubText('erro em /cliente/pedidos?id=5')).toBe('erro em /cliente/pedidos');
    expect(scrubText('/conta#secao')).toBe('/conta');
  });

  it('leaves text without personal data unchanged', async () => {
    const { scrubText } = await loadModule();
    expect(scrubText('Falha ao carregar pedido 123 (tentativa 2)')).toBe('Falha ao carregar pedido 123 (tentativa 2)');
  });
});

describe('scrubEvent', () => {
  it('removes the request body, cookies, headers, query string and the user', async () => {
    const { scrubEvent } = await loadModule();
    const event = scrubEvent(
      asEvent({
        user: { id: 'u1', email: 'ana@exemplo.com' },
        request: {
          url: 'https://app.example.com/api/pagar?cpf=12345678909',
          data: '{"description":"pia entupida"}',
          cookies: { sid: 'secreto' },
          headers: { Authorization: 'Bearer abc' },
          query_string: 'a=1',
        },
        contexts: { response: { body: 'resposta completa' }, os: { name: 'Android' } },
      }),
    );
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: 'https://app.example.com/api/pagar' });
    expect(event.contexts).toEqual({ os: { name: 'Android' } });
  });

  it('masks personal data in the message, the exception, extra data and tags', async () => {
    const { scrubEvent } = await loadModule();
    const event = scrubEvent(
      asEvent({
        message: 'Falha para ana@exemplo.com',
        exception: { values: [{ type: 'TypeError', value: 'telefone (11) 99999-1234 inválido' }] },
        extra: { componentStack: 'em CPF 123.456.789-09', count: 3 },
        tags: { route: '/conta?email=ana@exemplo.com' },
      }),
    );
    expect(event.message).toBe('Falha para [email]');
    expect((event.exception as { values: Array<{ value: string }> }).values[0].value).toBe(
      'telefone [telefone] inválido',
    );
    expect(event.extra).toEqual({ componentStack: 'em CPF [cpf]', count: 3 });
    expect(event.tags).toEqual({ route: '/conta' });
  });

  it('drops breadcrumbs that hold form values and keeps navigation', async () => {
    const { scrubEvent } = await loadModule();
    const event = scrubEvent(
      asEvent({
        breadcrumbs: [
          { category: 'ui.input', message: 'input#email' },
          { category: 'ui.click', data: { value: 'ana@exemplo.com' } },
          { category: 'xhr', data: { body: '{"x":1}' } },
          { category: 'navigation', message: '/pedido/abc?x=1', data: { to: '/pedido/abc' } },
        ],
      }),
    );
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', message: '/pedido/abc', data: { to: '/pedido/abc' } },
    ]);
  });
});

describe('initObservability', () => {
  it('without a DSN it does not load the SDK, make a request or report anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { initObservability, captureError, isErrorReportingEnabled } = await loadModule();

    await expect(initObservability({ dsn: '', release: '' })).resolves.toBe(false);
    captureError(new Error('falha'));

    expect(sentry.load).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isErrorReportingEnabled()).toBe(false);
  });

  it('with a DSN it initializes the SDK with the privacy settings and the release', async () => {
    const { initObservability, isErrorReportingEnabled } = await loadModule();

    await expect(initObservability({ dsn: DSN, release: '1.2.3' })).resolves.toBe(true);

    expect(sentry.load).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0][0];
    expect(options).toMatchObject({
      dsn: DSN,
      release: '1.2.3',
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
    });
    expect(isErrorReportingEnabled()).toBe(true);
  });

  it('runs every event through the scrubber before it is sent', async () => {
    const { initObservability } = await loadModule();
    await initObservability({ dsn: DSN, release: '' });
    const { beforeSend } = sentry.init.mock.calls[0][0];

    const sent = beforeSend(asEvent({ message: 'ana@exemplo.com', request: { data: 'corpo' } }), {});
    expect(sent).toMatchObject({ message: '[email]' });
    expect((sent as ErrorEvent).request).toEqual({});
  });

  it('forwards captured errors with their context once enabled', async () => {
    const { initObservability, captureError } = await loadModule();
    await initObservability({ dsn: DSN, release: '' });

    const error = new Error('quebrou');
    captureError(error, { componentStack: '\n in Pagina' });

    expect(sentry.captureException).toHaveBeenCalledWith(error, { extra: { componentStack: '\n in Pagina' } });
  });

  it('never writes the DSN to the console, even when the SDK fails', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    sentry.init.mockImplementation(() => {
      throw new Error(`invalid DSN ${DSN}`);
    });
    const { initObservability, isErrorReportingEnabled } = await loadModule();

    await expect(initObservability({ dsn: DSN, release: '' })).resolves.toBe(false);

    expect(isErrorReportingEnabled()).toBe(false);
    const printed = consoleSpies.flatMap(spy => spy.mock.calls.flat().map(String));
    expect(printed.join('\n')).not.toContain(DSN_KEY);
    expect(printed.join('\n')).not.toContain('sentry.io');
  });
});
