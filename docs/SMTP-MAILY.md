# SMTP maily.ovh (OVH MX Plan)

Même socle que JobbingTrack : compte technique **`noreply@maily.ovh`**, serveur OVH.

## Variables

| Variable | Valeur typique |
|----------|----------------|
| `SMTP_HOST` | `ssl0.ovh.net` |
| `SMTP_PORT` | `465` (SSL) ou `587` (STARTTLS) |
| `SMTP_SECURE` / `SMTP_USE_SSL` | `1` sur port 465 |
| `SMTP_USER` | `noreply@maily.ovh` |
| `SMTP_PASS` | mot de passe de la boîte (Portainer / `.env` local **uniquement**) |
| `SMTP_FROM` | `"YTMusic <noreply@maily.ovh>"` (guillemets recommandés) |
| `SMTP_REPLY_TO` | `noreply@maily.ovh` |
| `APP_URL` | URL publique (liens `/verify-email?token=…`) |

Sans `SMTP_HOST` → mails uniquement dans **Admin → outbox** + logs console.

## Expéditeur affiché « JobbingTrack Security » ?

La boîte **`noreply@maily.ovh`** est partagée avec JobbingTrack (alertes security). Deux causes fréquentes :

1. **Cache Gmail / client mail** — pour une même adresse, le client garde l’ancien nom d’affichage (« JobbingTrack Security ») même si le header `From:` dit `YTMusic`. Ouvre le mail → détails → vérifie le vrai `From:`. Ou cherche un mail dont le **sujet** commence par `[YTMusic]`.
2. **Nom d’affichage OVH du compte** — Webmail Roundcube / OVH → compte `noreply` → identité / nom affiché → mets **YTMusic** (ou « Noreply ») au lieu de JobbingTrack.

YTMusic envoie bien `From: YTMusic <noreply@maily.ovh>` (objet nodemailer `{ name, address }` + header `X-Mailer: YTMusic`).

## Local

1. Copie `.env.example` → `.env`
2. Renseigne `SMTP_PASS` (ou laisse vide pour outbox)
3. `make seed-users` (crée `paul@` / `dev@` si `SEED_PASSWORD` défini)
4. `make dev` → Admin → **Tester SMTP** vers `dev@delhomme.ovh`

Alternative Mailhog : `make docker-dev` puis `SMTP_HOST=localhost` `SMTP_PORT=1025` `SMTP_SECURE=0`.

## Prod (Portainer)

Dans la stack `ytmusic`, injecte les `SMTP_*` (secrets Portainer).  
NPM : `ytmusic.delhomme.ovh` → `http://ytmusic:8787` + Websockets.

## Inscription / multi-appareils

1. Création compte → email de validation depuis `noreply@maily.ovh`
2. Login → JWT access + refresh long (cookies / localStorage) → sync biblio, prefs, reco, playlists via le même `userId`
3. Cast / sessions WS : plusieurs devices du même compte

## Admin

- `GET /api/admin/smtp` — config publique (sans mot de passe)
- `POST /api/admin/smtp/test` `{ "to": "…" }` — verify + envoi test
- Outbox : mails stockés même en mode SMTP (audit)

Réf. JobbingTrack : `docs/emails/SMTP_CONFIGURATION.md` (§ OVH maily.ovh).
