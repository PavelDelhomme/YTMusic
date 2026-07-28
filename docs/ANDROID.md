# Application Android native (Kotlin)

Client **Kotlin + Jetpack Compose + Media3/ExoPlayer** — pas de WebView, pas de Passkey/WebAuthn.

Package : `ovh.delhomme.ytmusic`  
Sources : `mobile-android/`

## Installer

```bash
# API locale + build + adb install
make android

# Ou
make ensure-api && make android-install
```

Prod :

```bash
make android-prod DEVICE=R5CT7263YJL
```

API custom :

```bash
API_BASE_URL=http://192.168.1.10:8787 make android-install
```

## Auth

Email + mot de passe (+ 2FA TOTP si activé). **Pas de Passkey** (WebAuthn n’existe pas hors navigateur sécurisé).

## Lecture

`PlaybackService` (MediaSessionService) : notification média, contrôles casque / écran verrouillé, lecture en arrière-plan.

Stream : `GET {API}/api/stream/:id` via `adb reverse tcp:8787` en local.

## Legacy Capacitor

Ancien APK WebView : `make android-capacitor` (voir `client/android/`). Déconseillé (Passkey / batterie / UI « site web »).
