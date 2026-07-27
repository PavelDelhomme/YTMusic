# Application Android native (Capacitor)

APK réel : UI **embarquée** dans l’application (plus de simple onglet web distant),
API via `VITE_API_ORIGIN`, lecture arrière-plan + cast multi-appareils.

## Installer

```bash
# Terminal 1 — API
make dev-server   # ou make dev

# Terminal 2 — APK native (API locale :8787 via adb reverse)
make android-install DEVICE=R5CT7263YJL
```

Prod :

```bash
make android-prod DEVICE=R5CT7263YJL
```

## Cast / contrôle

Dans l’app : barre du bas → **Cast** → choisir un PC / TV connecté avec le même compte,
ou Chromecast. Le téléphone pilote file, play/pause, volume à distance.

## Différence PWA

| | PWA | APK native |
|---|---|---|
| Bannière « Installer l’app » | oui (navigateur) | **jamais** |
| UI | site / SW | assets dans l’APK |
| Arrière-plan | limité | service `mediaPlayback` |
| Cast YTMusic | oui | oui (prioritaire) |

Live-reload (dev UI à chaud, rare) :

```bash
CAP_LIVE_RELOAD=1 CAP_SERVER_URL=http://127.0.0.1:5173 make android-install
```
