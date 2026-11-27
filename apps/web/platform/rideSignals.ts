import { Capacitor, CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { db } from '../services/client';

const gps = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export async function startRideLocation(
  legId: string,
  signal: AbortSignal,
  onStatus: (text: string) => void,
) {
  if (!Capacitor.isNativePlatform())
    throw new Error('Use o aplicativo Android ou iOS para compartilhar a posição.');
  const client = db();
  const permission = await client.rpc('ride_can_transmit', { p_leg: legId });
  if (permission.error || !permission.data)
    throw new Error('Este trecho ainda não está habilitado para localização.');
  if (signal.aborted) return;
  // The foreground-service notification must be visible even if the driver
  // does not subscribe to offer alerts.
  if (
    Capacitor.getPlatform() === 'android' &&
    (await PushNotifications.requestPermissions()).receive !== 'granted'
  )
    throw new Error('Permita a notificação que indica quando a localização está ativa.');
  if (signal.aborted) return;
  let watch: string | undefined;
  let ended = false;
  let busy = false;
  let lastSent = 0;
  function stop() {
    ended = true;
    if (watch)
      void gps
        .removeWatcher({ id: watch })
        .catch(() => onStatus('Confira a permissão de localização no sistema.'));
    signal.removeEventListener('abort', stop);
  }
  signal.addEventListener('abort', stop, { once: true });
  try {
    watch = await gps.addWatcher(
      {
        backgroundTitle: 'WorkEasy · trecho em andamento',
        backgroundMessage: 'A posição está sendo compartilhada. Abra o trecho para interromper.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 25,
      },
      async (point, error) => {
        if (ended || signal.aborted) return;
        if (error) {
          onStatus('Localização indisponível. Confira a permissão no sistema.');
          stop();
          return;
        }
        if (!point?.time || point.simulated || point.accuracy > 200 || busy || point.time < lastSent + 4000)
          return;
        busy = true;
        try {
          const session = (await client.auth.getSession()).data.session;
          if (!session || ended) {
            stop();
            return;
          }
          const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
          const response = await CapacitorHttp.post({
            url: url + '/rest/v1/rpc/ride_send_position',
            disableRedirects: true,
            headers: {
              apikey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
              Authorization: 'Bearer ' + session.access_token,
              'Content-Type': 'application/json',
            },
            data: {
              p_leg: legId,
              p_at: new Date(point.time).toISOString(),
              p_lat: point.latitude,
              p_lng: point.longitude,
              p_accuracy: point.accuracy,
            },
            connectTimeout: 5000,
            readTimeout: 5000,
          });
          if (ended) return;
          if (
            response.status === 401 ||
            response.status === 403 ||
            response.data?.message === 'transmission_ended'
          ) {
            onStatus('Compartilhamento encerrado pelo servidor.');
            stop();
            return;
          }
          if (response.status !== 200) throw new Error('position_unsent');
          lastSent = point.time;
          onStatus('Compartilhamento ativo.');
        } catch {
          if (!ended) onStatus('Sem confirmação da posição. Tentaremos na próxima atualização.');
        } finally {
          busy = false;
        }
      },
    );
    if (signal.aborted || ended) stop();
  } catch (error) {
    stop();
    throw error;
  }
}

export async function enableRideAlerts(signal: AbortSignal, onStatus: (text: string) => void) {
  const transport = Capacitor.getPlatform();
  if (transport !== 'android' && transport !== 'ios')
    throw new Error('Os alertas precisam do aplicativo móvel.');
  const client = db();
  const ready = await client.rpc('ride_push_ready');
  if (ready.error || !ready.data) throw new Error('Alertas ainda indisponíveis neste turno.');
  if (signal.aborted) return;
  if ((await PushNotifications.requestPermissions()).receive !== 'granted')
    throw new Error('Autorize as notificações nas configurações do aparelho.');
  if (signal.aborted) return;
  const handles: PluginListenerHandle[] = [];
  const clean = () => {
    for (const handle of handles) void handle.remove();
    // Explicit sign-out/offline is independently checked at dispatch time.
    void client.rpc('ride_device', { p_transport: transport, p_token: '', p_enable: false }).then(() => {});
  };
  const token = await PushNotifications.addListener('registration', async (result) => {
    if (signal.aborted) return;
    const { error } = await client.rpc('ride_device', {
      p_transport: transport,
      p_token: result.value,
      p_enable: true,
    });
    if (signal.aborted) {
      clean();
      return;
    }
    onStatus(
      error ? 'Não foi possível registrar o aparelho.' : 'Alertas ativos neste aparelho durante o turno.',
    );
  });
  handles.push(token);
  handles.push(
    await PushNotifications.addListener('registrationError', () =>
      onStatus('Falha ao registrar o aparelho para alertas.'),
    ),
  );
  if (signal.aborted) {
    clean();
    return;
  }
  signal.addEventListener('abort', clean, { once: true });
  try {
    await PushNotifications.register();
  } catch (error) {
    clean();
    throw error;
  }
}
