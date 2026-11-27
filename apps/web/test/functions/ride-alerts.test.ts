import { describe, expect, it, vi } from 'vitest';
import { sendAlert } from '../../supabase/functions/ride-alerts/providers.ts';

const key = async (alg: 'RSA' | 'EC') => {
  const pair = await crypto.subtle.generateKey(
    alg === 'RSA'
      ? {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
        }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const raw = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
};
describe('entrega de avisos de oferta', () => {
  it('requer credencial do backend antes de chamar o transporte', async () => {
    const send = vi.fn();
    await expect(sendAlert('ios', 'abc', 'leg', () => undefined, send)).rejects.toThrow(
      'configuration_missing',
    );
    expect(send).not.toHaveBeenCalled();
  });
  it('usa a conta APNs de homologação e alerta sem dados de trajeto', async () => {
    const pem = await key('EC');
    const send = vi.fn(async () => new Response(null, { status: 200 }));
    const env: Record<string, string> = {
      RIDE_APNS_TEAM: 'fixture',
      RIDE_APNS_KEY_ID: 'fixture',
      RIDE_APNS_PRIVATE_KEY: pem,
      RIDE_APNS_SANDBOX: 'true',
    };
    await sendAlert('ios', 'device', 'leg', (n) => env[n], send);
    expect(send).toHaveBeenCalledWith(
      'https://api.sandbox.push.apple.com/3/device/device',
      expect.objectContaining({ headers: expect.objectContaining({ 'apns-collapse-id': 'leg' }) }),
    );
  });
  it('requisição FCM separa a autenticação Google da entrega ao dispositivo', async () => {
    const pem = await key('RSA');
    const calls: {url:string; body:unknown}[] = [];
    const send: typeof fetch = async (input, options) => {
      calls.push({url:String(input),body:options?.body});
      return calls.length === 1 ? Response.json({access_token:'short-token'}) : Response.json({name:'notice'});
    };
    const env: Record<string, string> = {
      RIDE_FCM_PROJECT: 'fixture',
      RIDE_FCM_PRIVATE_KEY: pem,
      RIDE_FCM_CLIENT_EMAIL: 'fixture@example.org',
    };
    await sendAlert('android', 'device', 'leg', (n) => env[n], send);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/fixture/messages:send');
    expect(JSON.parse(String(calls[1].body)).message.notification.body).not.toContain('leg');
  });
});
