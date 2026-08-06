import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android native — UI embarquée dans l’APK (pas un site distant).
 * L’API est joignable via VITE_API_ORIGIN au build
 * (ex. https://ytmusic.delhomme.ovh ou http://127.0.0.1:8787).
 *
 * Live-reload optionnel : CAP_LIVE_RELOAD=1 CAP_SERVER_URL=http://… make android-install
 */
const liveReload = process.env.CAP_LIVE_RELOAD === '1';
const liveUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'ovh.delhomme.ytmusic',
  appName: 'PLM',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    ...(liveReload && liveUrl ? { url: liveUrl } : {}),
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#030303',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#030303',
      launchAutoHide: true,
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#030303',
    },
  },
};

export default config;
