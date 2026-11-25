import { describe, expect, it } from 'vitest';
import { validateReleaseConfig } from '../../scripts/release-config.mjs';

const webEnv = {
  VITE_SUPABASE_URL: 'https://hlzdgbxygtaklqaoihlq.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixtureValue000001',
  VITE_SITE_URL: 'https://fixture.workeasy-ci.org',
  VITE_CONCIERGE_WHATSAPP: '5511997594545',
  VITE_SAC_WHATSAPP: '5511997594545',
  VITE_LOGIN_METHODS: 'email',
  VITE_APP_VERSION: 'a'.repeat(40),
};

describe('production distribution configuration', () => {
  it('accepts a web release and requires the matching native store and router', () => {
    expect(() => validateReleaseConfig(webEnv, 'web', 'production')).not.toThrow();
    const android = { ...webEnv, VITE_ROUTER: 'hash', VITE_STORE_BUILD: 'android' };
    expect(() => validateReleaseConfig(android, 'android', 'native')).not.toThrow();
    expect(() => validateReleaseConfig(android, 'ios', 'native')).toThrow(/VITE_STORE_BUILD/);
    expect(() => validateReleaseConfig(android, 'android', 'production')).toThrow(/Modo Vite/);
    expect(() => validateReleaseConfig(webEnv, 'windows', 'native')).toThrow(/VITE_ROUTER/);
  });

  it.each([
    ['VITE_SUPABASE_URL', ''],
    ['VITE_SUPABASE_URL', 'https://other-project.supabase.co'],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_fixtureValue000001'],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_placeholder'],
    ['VITE_SITE_URL', 'https://app.workeasy.example'],
    ['VITE_SITE_URL', 'https://www.example.com'],
    ['VITE_SITE_URL', 'http://fixture.workeasy-ci.org'],
    ['VITE_SITE_URL', 'https://fixture.workeasy-ci.org/login'],
    ['VITE_LOGIN_METHODS', ''],
    ['VITE_APP_VERSION', 'latest'],
  ])('refuses invalid %s without including its value', (name, value) => {
    const validate = () => validateReleaseConfig({ ...webEnv, [name]: value }, 'web', 'production');
    expect(validate).toThrow(name);
    if (value) expect(validate).not.toThrow(value);
  });
});
