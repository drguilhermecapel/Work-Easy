// Deployment credentials come from the designated APNs/FCM accounts. No
// location, passenger name, fare or endpoint token is logged or sent in an alert.
import { config, must, serve, serviceClient } from '../_runtime/supabase.ts';
import { bearerToken, secretMatches } from '../_shared/secrets.ts';
import { sendAlert } from './providers.ts';

interface Alert { leg: string; device: string; transport: 'ios' | 'android'; token: string; attempt: number }

serve(async req => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!secretMatches(bearerToken(req.headers.get('Authorization')), config.cronSecret)) return new Response(null, { status: 401 });
  const db = serviceClient();
  const alerts = must(await db.rpc('claim_ride_alerts')) as Alert[];
  const outcomes = await Promise.allSettled(alerts.map(async alert => {
    await sendAlert(alert.transport, alert.token, alert.leg, name => Deno.env.get(name));
    must(await db.rpc('ack_ride_alert', { p_leg: alert.leg, p_device: alert.device, p_attempt: alert.attempt }));
  }));
  const delivered = outcomes.filter(outcome => outcome.status === 'fulfilled').length;
  return Response.json({ claimed: alerts.length, delivered }, { status: delivered === alerts.length ? 200 : 503 });
});
