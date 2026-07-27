# Déploiement YTMusic — VPS / Portainer / Nginx Proxy Manager

Ce guide couvre le **fix Vite 504**, le **déploiement prod** sur ton VPS (comme Nextcloud), et le **flux git prod/dev**.

---

## 1. Erreur Vite `504 Outdated Optimize Dep`

Ça arrive quand Vite a mis en cache d’anciennes deps (`@simplewebauthn/browser`, `qrcode.react`) puis que tu ajoutes/réinstalles des paquets.

**Correction locale (déjà appliquée dans le projet) :**

```bash
rm -rf client/node_modules/.vite node_modules/.vite
# Relancer npm run dev
```

Puis **hard refresh** du navigateur (`Ctrl+Shift+R`).

Si ça revient : ferme tous les `vite`, vide le cache, relance une seule fois `npm run dev`.

---

## 2. Architecture prod (recommandée)

Un **seul conteneur** `ytmusic` (léger) :

- API Express + WebSocket `/ws`
- Frontend web / PWA (fichiers `client/dist`)
- SQLite + caches dans le volume `ytmusic_data`

Nginx Proxy Manager pointe vers `http://ytmusic:8787` (comme `nextcloud` → `nextcloud:80`).

```
Internet → NPM (HTTPS ytmusic.delhomme.ovh)
              ↓
         conteneur ytmusic:8787  (API + SPA + WS)
```

Mobile = **même PWA** que le web (pas de Play Store) : mise à jour via service worker à la prochaine visite.

---

## 3. DNS OVH

Voir le guide détaillé : [`docs/DNS-ET-INSTALL.md`](docs/DNS-ET-INSTALL.md).

Dans la zone `delhomme.ovh`, ajoute :

| Type | Nom | Cible |
|------|-----|--------|
| A ou CNAME | `ytmusic` | IP du VPS (ou CNAME vers le même host que nextcloud) |

Ex. `ytmusic.delhomme.ovh` → `95.111.227.204` (adapte si ton IP a changé).

Ensuite NPM → `ytmusic:8787` + SSL + websockets. Commandes : `make help`, `make mobile-hint`, `make update-apps`.

---

## 4. GitHub — branches

| Branche | Rôle |
|---------|------|
| **`prod`** (défaut) | Production — images `ghcr.io/<user>/ytmusic:latest` et `:prod` |
| **`dev`** | Intégration / tests — image `:dev` |
| `feat/…`, `fix/…`, `misc/…`, `err/…`, `tests/…` | Travail depuis **dev** (voir `.cursor/rules/git-branches.mdc`) |

### Première fois (depuis ta machine)

```bash
cd /chemin/YTMusic
git init
git add .
git commit -m "chore: bootstrap YTMusic avec déploiement Docker"
git branch -M prod
# Crée le repo vide sur GitHub puis :
git remote add origin git@github.com:TON_USER/YTMusic.git
git push -u origin prod
git checkout -b dev
git push -u origin dev
```

Active **Packages** sur le repo (GHCR). Après un push sur `prod`, l’action `.github/workflows/docker.yml` build et push l’image.

Remplace `OWNER` dans :

- `docker-compose.yml` → `YTMUSIC_IMAGE`
- `deploy/portainer-template.yml` → `image:`

par `ton-user/ytmusic` (minuscules).

Pour que Portainer pull GHCR privé : Settings → Registries → add GitHub avec un PAT `read:packages`.

---

## 5. Stack Portainer

### Option A — Custom Template

1. Portainer → **App Templates** → **Custom Templates** → Create  
2. Title : `YTMusic`  
3. Description : `API + PWA YouTube Music`  
4. Type : **Compose**  
5. Colle le contenu de `deploy/portainer-template.yml` (avec ton image GHCR)  
6. Deploy / crée la stack

### Option B — Stack depuis Git

1. Stacks → Add stack → **Repository**  
2. URL du repo GitHub  
3. Reference : `refs/heads/prod`  
4. Compose path : `docker-compose.yml`  
5. Environnement : copie `.env.production.example` (JWT_SECRET, ADMIN_EMAILS, domaine passkeys, image)

Réseaux **externes** déjà présents chez toi :

- `nginx-proxy-manager_npm-network`
- `shared-network-copy`

Le compose les déclare en `external: true`.

---

## 6. Nginx Proxy Manager (comme Nextcloud)

**Nouveau Proxy Host**

### Détails

| Champ | Valeur |
|--------|--------|
| Domain Names | `ytmusic.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname / IP | `ytmusic` |
| Forward Port | `8787` |
| Cache Assets | optionnel (désactivé recommandé au début) |
| Block Common Exploits | activé |
| Websockets Support | **activé** (obligatoire pour `/ws`) |
| Access List | Publicly Accessible |

### SSL

- Certificate Let’s Encrypt pour `ytmusic.delhomme.ovh`
- Force SSL : activé  
- HTTP/2 : activé  

### Advanced

Rien de obligatoire. Si le WS pose problème, tu peux ajouter :

```nginx
# Custom Nginx Configuration
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400;
```

(souvent inutile si « Websockets Support » est déjà coché.)

---

## 7. Variables d’environnement critiques

```env
JWT_SECRET=<openssl rand -hex 32>
ADMIN_EMAILS=toi@email.com
WEBAUTHN_RP_ID=ytmusic.delhomme.ovh
WEBAUTHN_ORIGIN=https://ytmusic.delhomme.ovh
```

Sans ça, les **passkeys** échoueront en prod (RP ID ≠ domaine).

---

## 8. Mises à jour automatiques

### Backend / web (conteneur)

1. Merge `dev` → `prod` sur GitHub  
2. L’action Docker pousse `ghcr.io/.../ytmusic:latest`  
3. Dans Portainer : Stack → **Pull and redeploy**  
   ou active **Watchtower** (label déjà sur le service) pour pull auto

### Application mobile (PWA)

Pas de Play Store : l’utilisateur ouvre `https://ytmusic.delhomme.ovh`  
Le service worker (`registerType: 'autoUpdate'`) récupère la nouvelle version au prochain chargement.  
Même URL = même version web & mobile installée.

### Desktop Electron

Rebuild / redistribue depuis la branche `prod` quand tu veux (hors Portainer).

---

## 9. Flux de travail quotidien

```
feature → branche dev → tests locaux
              ↓
         merge PR vers prod
              ↓
         GitHub Actions → image :latest
              ↓
         Portainer Pull & Redeploy
              ↓
         NPM sert déjà ytmusic.delhomme.ovh
              ↓
         Clients web/PWA se mettent à jour seuls
```

### Dev local (sans Docker)

```bash
npm run dev
# UI http://localhost:5173  API http://localhost:8787
```

### Dev local en conteneur

```bash
cp .env.production.example .env
# édite JWT_SECRET
docker compose -f docker-compose.dev.yml up --build -d
# http://localhost:8787
```

### Prod VPS

Uniquement via Portainer + image `prod` / `:latest`.

---

## 10. Admin

1. Crée un compte sur le site (ou utilise le premier compte → admin auto)  
2. Ou définis `ADMIN_EMAILS=ton@email.com`  
3. Menu **Admin** → QR mobile, build status, URLs LAN (utile en local)

Compte démo local historique : `demo@ytmusic.local` / `demo1234` (à ne pas utiliser en prod).

---

## 11. Checklist go-live

- [ ] Repo GitHub avec `prod` + `dev`  
- [ ] Action Docker verte (image sur GHCR)  
- [ ] DNS `ytmusic.delhomme.ovh`  
- [ ] Stack Portainer healthy  
- [ ] Conteneur sur `nginx-proxy-manager_npm-network`  
- [ ] Proxy Host NPM + SSL + Websockets  
- [ ] `JWT_SECRET` + `WEBAUTHN_*` corrects  
- [ ] Connexion compte + passkey testés en HTTPS  
- [ ] Install PWA sur téléphone (même Wi‑Fi ou 4G)

---

## 12. Dépannage rapide

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| 502 Bad Gateway NPM | mauvais hostname / réseau | Conteneur doit être sur `npm-network`, nom `ytmusic` |
| WS cast KO | websockets off | Cocher Websockets Support |
| Passkey KO | mauvais RP ID | `WEBAUTHN_RP_ID` = hostname sans https |
| Image pull denied | GHCR privé | Registry + PAT dans Portainer |
| Vite 504 Optimize Dep | cache deps | `rm -rf **/ .vite` + restart |

---

Fichiers utiles dans le repo :

- `Dockerfile` — image prod  
- `docker-compose.yml` — stack Portainer  
- `docker-compose.dev.yml` — test local conteneur (+ Mailhog)  
- `deploy/portainer-template.yml` — template Custom  
- `.env.production.example` — variables  
- `.github/workflows/docker.yml` — build auto  
- `packages/platform-kit/` — socle réutilisable (env, auth longue, mail, telemetry)

---

## 13. Auth, email, 2FA, analytics (multi-env)

| Variable | Local | Préprod / Prod |
|----------|-------|----------------|
| `APP_ENV` | `local` | `preprod` / `production` |
| `APP_URL` | `http://localhost:5173` | `https://ytmusic.delhomme.ovh` |
| `SMTP_*` | optionnel (outbox admin) | recommandé |
| `JWT_ACCESS_TTL` | `14d` | idem |
| Refresh cookie | ~400 jours | idem + `COOKIE_SECURE=1` |

- Inscription → email de validation (`/verify-email?token=…`)
- Profil → activer TOTP 2FA
- Admin → Analytics (erreurs, perf, batterie) + boîte mail outbox
- Install PWA : bannière seulement si l’app n’est **pas** déjà en mode standalone (tous hosts)  

