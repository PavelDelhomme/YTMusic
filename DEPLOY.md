# Déploiement YTMusic — instance personnelle (un compte)

Guide unique pour **ton** setup : un seul compte (celui du `.env`), API verrouillée,
Nginx Proxy Manager, Portainer + GitHub, APK à jour via lien/QR.

| Quoi | Où | Comment |
|------|-----|---------|
| **Web + API** | Portainer | Image GHCR → stack `ytmusic` → NPM |
| **APK Android** | Volume Docker + Admin | Build **sur ton PC**, upload vers le serveur |

Le conteneur **n’a pas** le SDK Android → on ne compile pas l’APK dans Portainer.

---

## Ce que tu veux (résumé)

1. **Un seul compte** = email(s) dans `ADMIN_EMAILS` / `AUTH_ALLOWED_EMAILS` (comme ton `.env` local).
2. **Personne d’autre** ne peut s’inscrire, jouer en invité, ni streamer sans JWT.
3. **NPM** expose `https://ytmusic.delhomme.ovh` → conteneur `ytmusic:8787`.
4. **Git** : push `prod` → GitHub Actions build l’image → **Watchtower** (ou SSH / API CE) met à jour le conteneur.
5. **APK** : Admin local **APK → VPS** (ou `make android-upload-apk`) → lien `/api/deploy/apk`.

---

## TL;DR — première mise en ligne (ordre exact)

### 0. DNS (sinon rien ne résout)

Chez OVH (ou ton DNS) :

| Type | Nom | Cible |
|------|-----|--------|
| A ou CNAME | `ytmusic` | IP du VPS |

Attends la propagation (`dig ytmusic.delhomme.ovh`).  
Sans ça : `Could not resolve host` sur upload APK / navigateur.

### 1. Image Docker (depuis ton PC)

```bash
git checkout prod
git pull
git merge origin/dev   # quand tu veux promo
git push origin prod
# → Actions : ghcr.io/paveldelhomme/ytmusic:latest (+ :prod)
```

Vérifie que le workflow Docker est **vert** sur GitHub.

### 2. Stack Portainer

**Option A — Web editor (recommandé si Git pose problème)**

1. Portainer → **Stacks** → Add stack  
2. Name : `ytmusic`  
3. Colle le contenu de [`deploy/portainer-template.yml`](deploy/portainer-template.yml)  
4. **Environment variables** (obligatoire) :

```env
JWT_SECRET=<sortie de: openssl rand -hex 32>
SMTP_PASS=<mot de passe maily>
ADMIN_EMAILS=toi@email.com
AUTH_ALLOWED_EMAILS=toi@email.com
AUTH_ALLOW_REGISTER=0
AUTH_ALLOW_GUEST=0
APP_URL=https://ytmusic.delhomme.ovh
WEBAUTHN_RP_ID=ytmusic.delhomme.ovh
WEBAUTHN_ORIGIN=https://ytmusic.delhomme.ovh
YTMUSIC_IMAGE=ghcr.io/paveldelhomme/ytmusic:latest
```

5. Deploy → conteneur `ytmusic` **healthy**

**Option B — Repository Git**

| Champ | Valeur exacte |
|-------|----------------|
| Repository URL | `https://github.com/PavelDelhomme/YTMusic` |
| Reference | `refs/heads/prod` (**heads**, pas `head`) |
| Compose path | `docker-compose.yml` |

Puis les **mêmes** variables d’env que ci-dessus.  
Ne colle **pas** une URL `/tree/prod/...` — Portainer veut la racine du repo.

Réseaux **externes** (déjà sur ton serveur) :

- `nginx-proxy-manager_npm-network`
- `shared-network-copy`

Si GHCR est privé : Registries → GHCR + PAT `read:packages`.

### 3. Nginx Proxy Manager

| Champ | Valeur |
|--------|--------|
| Domain Names | `ytmusic.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname | `ytmusic` (nom du **container_name**) |
| Forward Port | `8787` |
| Websockets Support | **ON** |
| SSL | Request new certificate + Force SSL |

### 4. Créer ton compte admin (une fois)

L’inscription publique est **fermée**. Deux façons :

**A — Seed temporaire** (local/dev, puis sync DB) : `make seed-users`  
**B — Ouverture ponctuelle** : dans Portainer, mets `AUTH_ALLOW_REGISTER=1`, redeploy, inscris **ton** email allowlisté, remets `0`, redeploy.

Ensuite : login sur `https://ytmusic.delhomme.ovh` avec cet email.

### 5. APK (après que le site répond en HTTPS)

```bash
# Sur ta machine (Android SDK) — une commande :
ADMIN_EMAIL=toi@email.com ADMIN_PASSWORD='…' make android-upload-apk
```

Puis : site → **Admin** → **Déploiement mobile** → QR /  
`https://ytmusic.delhomme.ovh/api/deploy/apk`

Sans CLI : build local puis **Uploader une APK** dans Admin  
(`API_BASE_URL=https://ytmusic.delhomme.ovh make android-publish`).

---

## Sécurité (mode privé)

Dès `APP_ENV=production` (sauf si `AUTH_PRIVATE=0`) :

| Contrôle | Effet |
|----------|--------|
| `AUTH_ALLOW_REGISTER=0` | Pas d’inscription ouverte |
| `AUTH_ALLOW_GUEST=0` | Pas d’invités HTTP / WebSocket |
| `AUTH_ALLOWED_EMAILS` / `ADMIN_EMAILS` | Seuls ces emails peuvent se connecter |
| Routes catalogue / stream / paroles | JWT obligatoire |
| Admin / upload APK | Compte admin seulement |

L’APK téléchargeable **ne contient pas** ta biblio — juste le binaire.  
Pour verrouiller le lien : `APK_DOWNLOAD_TOKEN=secret` → URL `…/api/deploy/apk?key=secret`.

Le site web (SPA) reste visible ; sans login, l’API renvoie **401**.

---

### Mise à jour depuis Admin (localhost) — sans Portainer Pro

Les **webhooks de stack** sont une feature **Portainer Business/Pro**. En CE on ne les utilise pas.

Sur ton PC (`APP_ENV=local`) → `http://localhost:5173/admin` → **Mise en production** :

| Bouton | Effet |
|--------|--------|
| **Web (git → image)** | merge `dev` → `prod` + push → attend CI GHCR → redeploy VPS |
| **APK → VPS** | build APK figée prod + upload sur le serveur |
| **Web + APK** | les deux |
| **Réparer client local** | SW + caches navigateur |

#### Redeploy VPS — 3 contournements CE (choisis-en un)

**A) Watchtower (recommandé, zéro config après)**

1. Portainer → Add stack `watchtower` → colle [`deploy/watchtower-compose.yml`](deploy/watchtower-compose.yml)
2. Le conteneur `ytmusic` a déjà le label `watchtower.enable=true`
3. Après chaque push `prod`, Watchtower pull `:latest` sous ~5 min et recrée le conteneur (volume conservé)

**B) Access Token Portainer (gratuit en CE)**

1. Portainer → ton profil (en haut à droite) → **Access tokens** → Add  
2. Dans `.env` **local** :

```env
DEPLOY_URL=https://ytmusic.delhomme.ovh
PORTAINER_URL=https://portainer.ton-domaine
PORTAINER_API_KEY=ptr_…
PORTAINER_STACK_NAME=ytmusic
```

Le script appelle l’API CE (`git/redeploy` ou `RepullImageAndRedeploy`) — pas de webhook.

**C) SSH**

```env
DEPLOY_SSH=user@ip-du-vps
DEPLOY_SSH_CMD='docker pull ghcr.io/paveldelhomme/ytmusic:latest && docker restart ytmusic'
```

Clé SSH en `BatchMode` (déjà dans `ssh-agent` / `~/.ssh`).

Sans A/B/C : le bouton Web pousse quand même l’image ; tu fais **Pull and redeploy** une fois dans l’UI Portainer.

Login APK distant : `SEED_PASSWORD` ou `ADMIN_PASSWORD` dans `.env`.

---

## Mise à jour quotidienne

```
feat/… → merge → dev → (tests)
                    ↓
         Admin « Web »  (ou merge → prod + push)
                    ↓
         GitHub Actions → image :latest
                    ↓
         Watchtower / API CE / SSH   ← web/API
                    ↓
         Admin « APK → VPS »         ← mobile (quand tu veux)
```

- **Ne coche jamais** « Remove volumes » au redeploy (sinon SQLite + APK perdus).
- PWA : se rafraîchit au prochain chargement.
- APK : republier + réinstaller (ou rescanner le QR).

Commandes utiles :

```bash
make deploy-hint
make push-prod
make android-upload-apk
bash scripts/redeploy-vps.sh   # redeploy seul (après image déjà buildée)
```

---

## Checklist go-live

- [ ] DNS `ytmusic.delhomme.ovh` résout
- [ ] Push `prod` → workflow Docker vert
- [ ] Stack Portainer healthy sur `npm-network`
- [ ] NPM : SSL + **Websockets ON** → `ytmusic:8787`
- [ ] Env : `JWT_SECRET`, `SMTP_PASS`, `ADMIN_EMAILS`, `AUTH_ALLOWED_EMAILS`
- [ ] `AUTH_ALLOW_REGISTER=0` / `AUTH_ALLOW_GUEST=0`
- [ ] Login avec **ton** email OK
- [ ] Sans token : `/api/home` → 401
- [ ] `make android-upload-apk` → QR installable
- [ ] Stack **watchtower** déployée **ou** `PORTAINER_API_KEY` / `DEPLOY_SSH` dans `.env` local
- [ ] Volume `ytmusic_data` conservé

---

## Dépannage

| Symptôme | Fix |
|----------|-----|
| `Could not resolve host` / NXDOMAIN | DNS pas encore OK (étape 0) |
| Portainer Git KO | URL repo racine + `refs/heads/prod` + path `docker-compose.yml` — ou Web editor |
| 502 NPM | Conteneur sur `npm-network`, hostname = `ytmusic` |
| Pull denied GHCR | Registry + PAT `read:packages` |
| Inscription impossible | Normal en privé — allowlist + seed / `AUTH_ALLOW_REGISTER=1` une fois |
| Stream 401 sur téléphone | APK/client à jour (token sur `/api/stream`) + être connecté |
| Admin « Compiler » KO sur VPS | Normal → **Uploader** ou `make android-upload-apk` |
| APK 404 | Pas encore uploadée |
| Conteneur pas à jour après push | Watchtower pas déployé / API CE / SSH — ou Pull manuel |
| Webhook Portainer | Feature **Pro** — on n’utilise pas ; voir Watchtower / Access Token / SSH |
| Passkey KO | `WEBAUTHN_RP_ID` = hostname sans `https://` |
| Comptes / APK perdus | Remove volumes coché — restore backup |

---

## Fichiers de référence

| Fichier | Rôle |
|---------|------|
| [`deploy/portainer-template.yml`](deploy/portainer-template.yml) | Compose stack ytmusic |
| [`deploy/watchtower-compose.yml`](deploy/watchtower-compose.yml) | MAJ auto image (CE, sans webhook) |
| [`docker-compose.yml`](docker-compose.yml) | Même stack (mode Git) |
| [`.env.production.example`](.env.production.example) | Variables stack prod |
| [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | Build GHCR sur push `prod` / `dev` |
| `scripts/admin-deploy-prod.sh` | Boutons Admin Web / APK |
| `scripts/redeploy-vps.sh` | Redeploy SSH / API CE / hint Watchtower |
| `scripts/android-publish-apk.sh` | Build APK local |
| `scripts/publish-apk-remote.sh` | Upload APK vers le VPS |
| [`docs/DNS-ET-INSTALL.md`](docs/DNS-ET-INSTALL.md) | DNS détail |
| [`docs/SMTP-MAILY.md`](docs/SMTP-MAILY.md) | SMTP |

---

## Auth / email (rappel)

| Variable | Local | Prod |
|----------|-------|------|
| `APP_ENV` | `local` | `production` |
| `APP_URL` | `http://localhost:5173` | `https://ytmusic.delhomme.ovh` |
| `AUTH_PRIVATE` | off (défaut) | on (défaut) |
| `COOKIE_SECURE` | `0` | `1` |

| Action Portainer | Données (users, APK) |
|------------------|----------------------|
| Pull & Redeploy | **Conservées** |
| Delete stack **avec** volumes | **Perdues** |
