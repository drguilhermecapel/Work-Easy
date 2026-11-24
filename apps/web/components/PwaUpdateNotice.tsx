/// <reference types="vite-plugin-pwa/client" />
import React, { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker and, when a new version of the app has been
 * downloaded, asks before switching to it. The new version waits until the
 * visitor accepts (pwa.config.ts: registerType "prompt"), so nothing reloads
 * under someone who is filling in a form, and a tab keeps working with the
 * files its own version was built with. It does nothing where there is no
 * service worker (development, the native apps, browsers without support).
 */
const PwaUpdateNotice: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const update = useRef<(reload?: boolean) => Promise<void>>(undefined);

  useEffect(() => {
    update.current = registerSW({ onNeedRefresh: () => setReady(true) });
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-gray-900 text-white shadow-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-48 text-sm">Há uma versão nova do WorkEasy. Atualize para usá-la.</p>
        <button
          type="button"
          onClick={() => void update.current?.(true)}
          className="text-sm font-semibold bg-white text-gray-900 px-4 py-2 rounded-xl hover:bg-gray-100"
        >
          Atualizar
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-sm font-semibold text-gray-200 px-2 py-2 hover:text-white">
          Agora não
        </button>
      </div>
    </div>
  );
};

export default PwaUpdateNotice;
