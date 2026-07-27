# Platform Kit — réutilisation multi-projets

Ce dossier est **indépendant du métier YTMusic**. Tu peux le copier dans un autre repo.

## Inclut (conceptuellement)

| Élément | Fichier source YTMusic |
|---------|-------------------------|
| Compose Portainer + réseaux NPM | `docker-compose.yml`, `deploy/portainer-template.yml` |
| Schéma auth longue + email + telemetry | `server/src/platform.ts`, `mail.ts`, `totp.ts` |
| Doc déploiement | `DEPLOY.md` |
| Helpers env | `packages/platform-kit/index.ts` |

## Environnements

```bash
APP_ENV=local|preprod|production
APP_URL=https://ton-domaine
SMTP_HOST=...   # sinon outbox admin + logs console
```

## Réseaux Portainer (externes)

- `nginx-proxy-manager_npm-network`
- `shared-network-copy` (optionnel)

## Auth longue durée

- Access JWT (~14j)
- Refresh token (~400j) en cookie httpOnly + localStorage optionnel
- Rotation à chaque `/api/auth/refresh`

## Emails

- Prod / préprod : SMTP réel
- Local : `mail_outbox` + log console (pas besoin de serveur mail)

## Télémétrie

`POST /api/telemetry` — erreurs, perf, batterie (si API dispo)
Admin : `/api/admin/telemetry`, `/api/admin/mail-outbox`
