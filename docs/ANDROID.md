# Application Android native (Kotlin)

Client **Kotlin + Jetpack Compose + Media3/ExoPlayer** — pas de WebView.

Sources : `mobile-android/` · Package : `ovh.delhomme.ytmusic`

## Structure monorepo

| Dossier | Rôle |
|---------|------|
| `api/` | Backend Express + SQLite + WebSocket |
| `web/` | Front React / Vite / PWA |
| `mobile-android/` | App Android Kotlin native |
| `desktop/` | Electron (optionnel) |

## Installer

```bash
make android              # API locale (IP LAN auto) + APK
make android-prod         # API https://ytmusic.delhomme.ovh
API_BASE_URL=http://192.168.x.x:8787 make android   # forcer l’IP
make seed-users           # comptes SEED_* du .env
```

> **Important** : sur un téléphone physique, `http://127.0.0.1:8787` pointe vers le téléphone
> (erreur « Failed to connect to /127.0.0.1:8787 »). Le script d’install utilise l’**IP LAN**
> de la machine + `adb reverse` en secours. Définis `ANDROID_API_BASE_URL` dans `.env` si besoin.

## Auth

- Email / mot de passe préremplis depuis `.env` (`SEED_EMAIL` / `SEED_PASSWORD`)
- Passkeys via **Credential Manager** (Biblio → Enregistrer une passkey)
- Asset links : `GET /.well-known/assetlinks.json`

## Legacy Capacitor

`make android-capacitor` → `web/android/` (WebView, déconseillé).
