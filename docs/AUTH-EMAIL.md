# Validation email & comptes (local + ADB + prod)

## Flux

1. Inscription (`POST /api/auth/register`) → email via `noreply@maily.ovh`
2. Lien : `{APP_URL}/verify-email?token=…`
3. Page Validation → marque `email_verified` → session / accueil

## Local + téléphone USB

```bash
make dev
# APP_URL=http://127.0.0.1:5173 dans .env
TEST_PASSWORD='ton-mdp' make test-register-adb
# recrée dev@delhomme.ovh, envoie le mail, ouvre Chrome sur le device
make mobile-install-adb   # installer la PWA
```

Le lien utilise `127.0.0.1:5173` : `adb reverse` le mappe vers ton PC.

Hors production, la réponse d’inscription contient aussi `verifyUrl` (pratique ADB / debug).

## Prod

```env
APP_ENV=production
APP_URL=https://ytmusic.delhomme.ovh
```

Les liens pointent vers le domaine NPM. Volume `ytmusic_data` conserve users / prefs / playlists lors des redeploys (ne pas supprimer les volumes).

## Comptes

```bash
SEED_PASSWORD='…' make seed-users   # paul@ + dev@ (email déjà vérifié)
```
