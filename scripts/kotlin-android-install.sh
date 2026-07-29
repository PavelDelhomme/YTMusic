#!/usr/bin/env bash
# Build + install APK Android Kotlin natif (Compose / Media3) — sans Capacitor / WebView
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/mobile-android"
DEVICE="${DEVICE:-R5CT7263YJL}"
MODE="${1:-install}" # build | install

export ANDROID_HOME="${ANDROID_HOME:-/home/pactivisme/Android/Sdk}"
if [[ "$ANDROID_HOME" == /opt/android-sdk* ]] || [[ ! -d "$ANDROID_HOME/platforms" ]]; then
  if [[ -d /home/pactivisme/Android/Sdk/platforms ]]; then
    export ANDROID_HOME=/home/pactivisme/Android/Sdk
  fi
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [[ -x /usr/lib/jvm/java-21-openjdk/bin/javac ]]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
elif [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/javac" ]]; then
  if [[ -x /usr/lib/jvm/java-17-openjdk/bin/javac ]]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
  fi
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

API_BASE_URL="${API_BASE_URL:-${VITE_API_ORIGIN:-}}"

detect_lan_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}'
}

# Sur un téléphone physique, 127.0.0.1 = le téléphone → utiliser l’IP LAN de la machine
if [[ -z "$API_BASE_URL" || "$API_BASE_URL" == *"127.0.0.1"* || "$API_BASE_URL" == *"localhost"* ]]; then
  LAN="$(detect_lan_ip || true)"
  if [[ -n "${LAN:-}" ]]; then
    API_BASE_URL="http://${LAN}:8787"
    echo "==> API LAN auto : $API_BASE_URL (évite Failed to connect to /127.0.0.1:8787)"
  else
    API_BASE_URL="http://127.0.0.1:8787"
    echo "==> API fallback 127.0.0.1 + adb reverse"
  fi
fi

echo "==> MODE=$MODE"
echo "==> DEVICE=$DEVICE"
echo "==> API_BASE_URL=$API_BASE_URL"
echo "==> ANDROID_HOME=$ANDROID_HOME"
echo "==> JAVA_HOME=$JAVA_HOME"

mkdir -p "$APP"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" >"$APP/local.properties"
echo "==> local.properties → sdk.dir=$ANDROID_HOME"

cd "$APP"
chmod +x ./gradlew

echo "==> Gradle assembleDebug…"
./gradlew :app:assembleDebug -PAPI_BASE_URL="$API_BASE_URL" --no-daemon

APK="$APP/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "APK introuvable: $APK" >&2
  exit 1
fi
echo "==> APK: $APK ($(du -h "$APK" | cut -f1))"

if [[ "$MODE" == "build" ]]; then
  exit 0
fi

if ! adb devices | awk 'NR>1 && $2=="device"{print $1}' | grep -qx "$DEVICE"; then
  echo "Device $DEVICE non connecté. Devices:" >&2
  adb devices -l >&2
  exit 1
fi

echo "==> adb reverse tcp:8787 + tcp:5173…"
adb -s "$DEVICE" reverse tcp:8787 tcp:8787 || true
adb -s "$DEVICE" reverse tcp:5173 tcp:5173 || true

echo "==> Install…"
adb -s "$DEVICE" install -r "$APK"
echo "==> Launch…"
adb -s "$DEVICE" shell am start -n ovh.delhomme.ytmusic/.MainActivity
echo "OK — app Kotlin native installée sur $DEVICE"
