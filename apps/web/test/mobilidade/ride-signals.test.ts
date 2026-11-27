import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mobile = vi.hoisted(() => ({
  rpc: vi.fn(),
  watcher: vi.fn(),
  remove: vi.fn(),
  platform: vi.fn(),
  permission: vi.fn(),
  http: vi.fn(),
  session: vi.fn(),
}));
vi.mock('../../services/client', () => ({
  db: () => ({ rpc: mobile.rpc, auth: { getSession: mobile.session } }),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: mobile.platform },
  CapacitorHttp: { post: mobile.http },
  registerPlugin: () => ({ addWatcher: mobile.watcher, removeWatcher: mobile.remove }),
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { requestPermissions: mobile.permission },
}));
import { startRideLocation } from '../../platform/rideSignals';

describe('compartilhamento voluntário por trecho', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mobile.platform.mockReturnValue('android');
    mobile.rpc.mockResolvedValue({ data: true, error: null });
    mobile.remove.mockResolvedValue(undefined);
    mobile.permission.mockResolvedValue({ receive: 'granted' });
    mobile.session.mockResolvedValue({ data: { session: { access_token: 'fixture' } } });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://workeasy.example');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-fixture');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('aguarda autorização do servidor antes de pedir GPS ou notificação', async () => {
    mobile.rpc.mockResolvedValue({ data: false, error: null });
    await expect(startRideLocation('leg', new AbortController().signal, vi.fn())).rejects.toThrow(
      'habilitado',
    );
    expect(mobile.watcher).not.toHaveBeenCalled();
    expect(mobile.permission).not.toHaveBeenCalled();
  });
  it('ignora posição sintética, transmite uma amostra válida e encerra o watcher', async () => {
    mobile.watcher.mockResolvedValue('watch-1');
    mobile.http.mockResolvedValue({ status: 200, data: true });
    const controller = new AbortController();
    await startRideLocation('leg', controller.signal, vi.fn());
    const callback = mobile.watcher.mock.calls[0][1];
    const point = { time: Date.now(), latitude: -23.6, longitude: -46.6, accuracy: 5 };
    await callback({ ...point, simulated: true });
    expect(mobile.http).not.toHaveBeenCalled();
    await callback(point);
    expect(mobile.http).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://workeasy.example/rest/v1/rpc/ride_send_position',
        disableRedirects: true,
        data: expect.objectContaining({ p_leg: 'leg', p_accuracy: 5 }),
      }),
    );
    controller.abort();
    await callback({ ...point, time: point.time + 5000 });
    expect(mobile.http).toHaveBeenCalledTimes(1);
    expect(mobile.remove).toHaveBeenCalledWith({ id: 'watch-1' });
  });
  it('encerra depois da revogação recebida do backend', async () => {
    mobile.watcher.mockResolvedValue('watch-1');
    mobile.http.mockResolvedValue({ status: 400, data: { message: 'transmission_ended' } });
    const update = vi.fn();
    await startRideLocation('leg', new AbortController().signal, update);
    await mobile.watcher.mock.calls[0][1]({ time: Date.now(), latitude: 0, longitude: 0, accuracy: 4 });
    expect(update).toHaveBeenCalledWith(expect.stringContaining('encerrado'));
    expect(mobile.remove).toHaveBeenCalled();
  });
});
