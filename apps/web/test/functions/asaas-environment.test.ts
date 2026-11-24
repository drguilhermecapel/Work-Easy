// @vitest-environment node
// Contract for the two environments of the Edge Functions. Production never falls back to the Asaas
// sandbox and never opens localhost in CORS; development keeps both (docs/ARQUITETURA.md).
import { describe, expect, it } from 'vitest';
import { ASAAS_SANDBOX_URL, AsaasClient } from '../../supabase/functions/_shared/asaas-client.ts';
import {
  asaasBaseUrl, ConfigError, type EnvGetter, isProductionEnv, readConfig,
} from '../../supabase/functions/_shared/config.ts';
import { corsHeaders } from '../../supabase/functions/_shared/http.ts';

const env = (vars: Record<string, string>): EnvGetter => name => vars[name];

const PROD_SITE = 'https://workeasy.com.br';
const PROD_ASAAS = 'https://api.asaas.com/v3';
const LOCAL_APP = 'http://localhost:3000';

describe('ambiente: detecção de produção', () => {
  it('APP_ENV=production is production', () => {
    expect(isProductionEnv(env({ APP_ENV: 'production' }))).toBe(true);
  });

  it('an unknown APP_ENV value fails closed as production', () => {
    expect(isProductionEnv(env({ APP_ENV: 'prod' }))).toBe(true);
  });

  it('development, staging and test are not production, whatever SITE_URL says', () => {
    for (const APP_ENV of ['development', 'staging', 'test']) {
      expect(isProductionEnv(env({ APP_ENV, SITE_URL: PROD_SITE }))).toBe(false);
    }
  });

  it('without APP_ENV, a public SITE_URL means production', () => {
    expect(isProductionEnv(env({ SITE_URL: PROD_SITE }))).toBe(true);
  });

  it('without APP_ENV, a localhost SITE_URL or none at all means development', () => {
    expect(isProductionEnv(env({ SITE_URL: LOCAL_APP }))).toBe(false);
    expect(isProductionEnv(env({ SITE_URL: 'http://127.0.0.1:3000' }))).toBe(false);
    expect(isProductionEnv(env({}))).toBe(false);
  });

  it('a blank APP_ENV counts as unset, and an unparsable SITE_URL counts as production', () => {
    expect(isProductionEnv(env({ APP_ENV: '  ', SITE_URL: LOCAL_APP }))).toBe(false);
    expect(isProductionEnv(env({ SITE_URL: 'workeasy' }))).toBe(true);
  });
});

describe('ambiente de produção', () => {
  it('requires ASAAS_BASE_URL: there is no sandbox fallback', () => {
    const config = readConfig(env({ APP_ENV: 'production', ASAAS_API_KEY: 'root', SITE_URL: PROD_SITE }));
    expect(config.production).toBe(true);
    expect(config.asaas.baseUrl).toBeUndefined();
    expect(() => asaasBaseUrl(config)).toThrow(ConfigError);
    expect(() => asaasBaseUrl(config)).toThrow('ASAAS_BASE_URL não definida');
  });

  it('refuses the sandbox URL, with or without a trailing slash', () => {
    for (const ASAAS_BASE_URL of [ASAAS_SANDBOX_URL, `${ASAAS_SANDBOX_URL}/`]) {
      const config = readConfig(env({ APP_ENV: 'production', ASAAS_BASE_URL }));
      expect(() => asaasBaseUrl(config)).toThrow(ConfigError);
    }
  });

  it('uses the Asaas production URL, normalized without a trailing slash', () => {
    const config = readConfig(env({ APP_ENV: 'production', ASAAS_BASE_URL: `${PROD_ASAAS}/` }));
    expect(asaasBaseUrl(config)).toBe(PROD_ASAAS);
  });

  it('never allows localhost in CORS, even with ALLOW_DEV_ORIGINS=true', () => {
    const config = readConfig(env({
      APP_ENV: 'production', ASAAS_BASE_URL: PROD_ASAAS, ALLOW_DEV_ORIGINS: 'true', SITE_URL: PROD_SITE,
    }));
    expect(config.allowDevOrigins).toBe(false);
    expect(corsHeaders(LOCAL_APP, config.siteUrl, config.allowDevOrigins)['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsHeaders(PROD_SITE, config.siteUrl, config.allowDevOrigins)['Access-Control-Allow-Origin']).toBe(PROD_SITE);
  });

  it('keeps localhost closed when the sandbox is configured, because the sandbox is refused', () => {
    const config = readConfig(env({ APP_ENV: 'production', ASAAS_BASE_URL: ASAAS_SANDBOX_URL }));
    expect(config.allowDevOrigins).toBe(false);
    expect(() => asaasBaseUrl(config)).toThrow(ConfigError);
  });
});

describe('ambiente de desenvolvimento', () => {
  it('falls back to the sandbox and opens localhost, as before', () => {
    const config = readConfig(env({ APP_ENV: 'development' }));
    expect(config.production).toBe(false);
    expect(asaasBaseUrl(config)).toBe(ASAAS_SANDBOX_URL);
    expect(config.allowDevOrigins).toBe(true);
    expect(corsHeaders(LOCAL_APP, undefined, config.allowDevOrigins)['Access-Control-Allow-Origin']).toBe(LOCAL_APP);
  });

  it('accepts an explicit Asaas URL and keeps localhost closed unless ALLOW_DEV_ORIGINS=true', () => {
    const config = readConfig(env({ APP_ENV: 'staging', ASAAS_BASE_URL: PROD_ASAAS }));
    expect(asaasBaseUrl(config)).toBe(PROD_ASAAS);
    expect(config.allowDevOrigins).toBe(false);
    expect(readConfig(env({ APP_ENV: 'staging', ASAAS_BASE_URL: PROD_ASAAS, ALLOW_DEV_ORIGINS: 'true' })).allowDevOrigins).toBe(true);
  });
});

describe('AsaasClient', () => {
  it('has no default base URL: the caller must name the environment', () => {
    const fetch = async () => new Response('{}');
    expect(() => new AsaasClient({ apiKey: 'k', fetch, baseUrl: '' })).toThrow('Asaas base URL is required');
  });
});
