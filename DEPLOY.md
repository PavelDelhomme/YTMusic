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
4. **Git** : push `prod` → GitHub Actions build l’image → Portainer **Pull and redeploy**.
5. **APK** : `make android-upload-apk` → lien `/api/deploy/apk` (QR dans Admin).

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

## Mise à jour quotidienne

```
feat/… → merge → dev → (tests)
                    ↓
               merge → prod → push
                    ↓
         GitHub Actions → image :latest
                    ↓
         Portainer → Pull and redeploy   ← web/API
                    ↓
         make android-upload-apk         ← mobile (quand tu veux)
```

- **Ne coche jamais** « Remove volumes » au redeploy (sinon SQLite + APK perdus).
- PWA : se rafraîchit au prochain chargement.
- APK : republier + réinstaller (ou rescanner le QR).

Commandes utiles :

```bash
make deploy-hint
make push-prod          # si présent dans le Makefile
make android-upload-apk
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
| Passkey KO | `WEBAUTHN_RP_ID` = hostname sans `https://` |
| Comptes / APK perdus | Remove volumes coché — restore backup |

---

## Fichiers de référence

| Fichier | Rôle |
|---------|------|
| [`deploy/portainer-template.yml`](deploy/portainer-template.yml) | Compose à coller dans Portainer |
| [`docker-compose.yml`](docker-compose.yml) | Même stack (mode Git) |
| [`.env.production.example`](.env.production.example) | Variables à remplir |
| [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | Build GHCR sur push `prod` / `dev` |
| `scripts/android-publish-apk.sh` | Build APK local |
| `scripts/publish-apk-remote.sh` | Upload vers `/api/admin/…` |
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
