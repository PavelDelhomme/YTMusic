#!/usr/bin/env bash
# Build APK Android natif (UI embarquée + API distante) et install ADB
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/client"
DEVICE="${DEVICE:-R5CT7263YJL}"
MODE="${1:-install}" # sync | build | install

export ANDROID_HOME="${ANDROID_HOME:-/home/pactivisme/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# Capacitor 8 / AGP → JDK 21 de préférence
if [[ -x /usr/lib/jvm/java-21-openjdk/bin/javac ]]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
elif [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/javac" ]]; then
  if [[ -x /usr/lib/jvm/java-17-openjdk/bin/javac ]]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
  fi
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# API jointe par l’APK (pas le front Vite)
VITE_API_ORIGIN="${VITE_API_ORIGIN:-http://127.0.0.1:8787}"
export VITE_API_ORIGIN
CAP_LIVE_RELOAD="${CAP_LIVE_RELOAD:-0}"
export CAP_LIVE_RELOAD
CAP_SERVER_URL="${CAP_SERVER_URL:-}"

echo "==> MODE=$MODE"
echo "==> DEVICE=$DEVICE"
echo "==> VITE_API_ORIGIN=$VITE_API_ORIGIN"
echo "==> CAP_LIVE_RELOAD=$CAP_LIVE_RELOAD"
echo "==> JAVA_HOME=$JAVA_HOME ($("$JAVA_HOME/bin/java" -version 2>&1 | head -1))"

cd "$CLIENT"

echo "==> Build web assets (embarqués dans l’APK)…"
npm run build

# capacitor.config.json généré (sans server.url = app native réelle)
node <<'NODE'
const fs = require('fs');
const live = process.env.CAP_LIVE_RELOAD === '1';
const liveUrl = process.env.CAP_SERVER_URL || '';
const cfg = {
  appId: 'ovh.delhomme.ytmusic',
  appName: 'YTMusic',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: { allowMixedContent: true, backgroundColor: '#030303' },
  plugins: {
    SplashScreen: { backgroundColor: '#030303', launchAutoHide: true, showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#030303' },
  },
};
if (live && liveUrl) cfg.server.url = liveUrl;
fs.writeFileSync('capacitor.config.json', JSON.stringify(cfg, null, 2));
console.log('Wrote capacitor.config.json', live && liveUrl ? `(live ${liveUrl})` : '(bundled assets)');
NODE

npx cap sync android

if [[ "$MODE" == "sync" ]]; then
  echo "Sync OK"
  exit 0
fi

cd "$CLIENT/android"
chmod +x ./gradlew
./gradlew assembleDebug

APK="$CLIENT/android/app/build/outputs/apk/debug/app-debug.apk"
echo "==> APK: $APK"
ls -lh "$APK"

if [[ "$MODE" == "build" ]]; then
  exit 0
fi

adb -s "$DEVICE" wait-for-device
# Reverse API locale (et Vite seulement si live-reload)
adb -s "$DEVICE" reverse tcp:8787 tcp:8787 || true
if [[ "$CAP_LIVE_RELOAD" == "1" ]]; then
  adb -s "$DEVICE" reverse tcp:5173 tcp:5173 || true
fi

adb -s "$DEVICE" install -r "$APK"
adb -s "$DEVICE" shell am start -n ovh.delhomme.ytmusic/.MainActivity

echo ""
echo "App Android native installée."
echo "  UI = assets APK  ·  API = $VITE_API_ORIGIN"
echo "  Cast : bouton Cast de la barre → appareils / Chromecast"
echo "  Lance « make dev-server » (ou make dev) si API locale."
echo ""
