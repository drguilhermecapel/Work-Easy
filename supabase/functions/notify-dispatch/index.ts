import { config, logError, must, now, serve, serviceClient } from '../_runtime/supabase.ts';
import type { NotificationRow } from '../_shared/notifications.ts';
import { handler, type NotifyDeps } from './handler.ts';

const deps: NotifyDeps = {
  siteUrl: config.siteUrl,
  now,
  logError,
  cronSecret: config.cronSecret,
  whatsapp: config.whatsapp,
  email: config.email,
  fetch: (input, init) => fetch(input, init),
  store: {
    async claim(limit) {
      return (must(await serviceClient().rpc('claim_notifications', { p_limit: limit })) as NotificationRow[] | null) ?? [];
    },
    async update(id, patch) {
      must(await serviceClient().from('notifications').update(patch).eq('id', id));
    },
  },
};

serve(req => handler(req, deps));
