import type { CapacitorConfig } from '@capacitor/cli';

// Android and iOS shells. They load the bundle built with `--mode native`
// (see vite.config.ts) from `dist/`.
const config: CapacitorConfig = {
  appId: 'br.com.workeasy',
  appName: 'WorkEasy',
  webDir: 'dist',
  backgroundColor: '#f9fafb',
  // The WebView origins are part of the CORS allow-list of the Edge Functions
  // (docs/ARQUITETURA.md, "CORS"): https://localhost on Android and
  // capacitor://localhost on iOS. Changing them breaks the calls from the apps.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    cleartext: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
