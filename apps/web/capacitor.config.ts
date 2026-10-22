import type { CapacitorConfig } from '@capacitor/cli';

// Android and iOS shells. They load the bundle built with `--mode native`
// (see vite.config.ts) from `dist/`.
const config: CapacitorConfig = {
  appId: 'br.com.workeasy',
  appName: 'WorkEasy',
  webDir: 'dist',
  backgroundColor: '#f9fafb',
  ios: {
    contentInset: 'never',
  },
};

export default config;
