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
make android              # API locale + APK
make android-prod         # API https://ytmusic.delhomme.ovh
make seed-users           # comptes SEED_* du .env
```

## Auth

- Email / mot de passe préremplis depuis `.env` (`SEED_EMAIL` / `SEED_PASSWORD`)
- Passkeys via **Credential Manager** (Biblio → Enregistrer une passkey)
- Asset links : `GET /.well-known/assetlinks.json`

## Legacy Capacitor

`make android-capacitor` → `web/android/` (WebView, déconseillé).
