# Déploiement YTMusic — VPS / Portainer / Mobile

Guide **actionnable**. Deux canaux distincts :

| Quoi | Où | Comment |
|------|-----|---------|
| **Web + API** | Portainer (Docker) | Image GHCR → stack `ytmusic` → NPM |
| **APK Android** | Admin du site + volume Docker | Compile **en local**, upload vers le serveur |

Le conteneur Docker **n’a pas** le SDK Android → on ne compile pas l’APK dans Portainer.

---

## TL;DR — première mise en ligne

### A. Web (Portainer)

```bash
# 1. Sur ta machine : merger vers prod pour builder l’image
git checkout prod && git merge origin/dev && git push origin prod
# → GitHub Actions pousse ghcr.io/paveldelhomme/ytmusic:latest
```

2. Portainer → **Stacks** → Add stack (ou ouvre la stack `ytmusic`)
3. Compose = contenu de `deploy/portainer-template.yml` (ou git `docker-compose.yml` branche `prod`)
4. Variables d’env (copie `.env.production.example`) — **obligatoire** :
   - `JWT_SECRET` = `openssl rand -hex 32`
   - `SMTP_PASS` = mot de passe maily
   - `ADMIN_EMAILS` = ton email
   - `APP_URL` / `WEBAUTHN_*` = `https://ytmusic.delhomme.ovh`
5. Deploy → conteneur `ytmusic` healthy
6. NPM → Proxy Host `ytmusic.delhomme.ovh` → `ytmusic:8787`, SSL + **Websockets ON**

Mise à jour web ensuite : push `prod` → Portainer **Pull and redeploy** (ne coche pas « Remove volumes »).

### B. Mobile (APK)

```bash
# Sur ta machine (avec Android SDK) — une commande :
ADMIN_EMAIL=toi@email.com ADMIN_PASSWORD='…' make android-upload-apk
```

Ça compile l’APK pointant vers `https://ytmusic.delhomme.ovh`, puis l’upload
dans le volume Portainer. Ensuite :

1. Ouvre `https://ytmusic.delhomme.ovh` → **Admin** → **Déploiement mobile**
2. Scanne le QR / ouvre `https://ytmusic.delhomme.ovh/api/deploy/apk`
3. Installe l’APK sur le téléphone

Sans CLI : Admin → **Uploader une APK** (fichier `data/public/android/ytmusic.apk`
après `API_BASE_URL=https://ytmusic.delhomme.ovh make android-publish`).

---

## 1. Erreur Vite `504 Outdated Optimize Dep`

```bash
rm -rf web/node_modules/.vite node_modules/.vite
# Relancer npm run dev + Ctrl+Shift+R
```

---

## 2. Architecture prod

```
Internet → NPM (HTTPS ytmusic.delhomme.ovh)
              ↓
         conteneur ytmusic:8787  (API + SPA + WS)
              ↓
         volume ytmusic_data  (/app/data → SQLite + APK publique)
```

Mobile natif = APK qui parle à la même URL HTTPS (API figée au build).

---

## 3. DNS OVH

Voir [`docs/DNS-ET-INSTALL.md`](docs/DNS-ET-INSTALL.md).

| Type | Nom | Cible |
|------|-----|--------|
| A ou CNAME | `ytmusic` | IP du VPS |

---

## 4. GitHub — branches

| Branche | Image Docker |
|---------|--------------|
| **`prod`** | `:latest` + `:prod` |
| **`dev`** | `:dev` |

Travail courant = `feat/…` → PR vers **`dev`** → plus tard **`dev` → `prod`**.

Portainer Registry GHCR (si privé) : PAT avec `read:packages`.

Image : `ghcr.io/paveldelhomme/ytmusic:latest` (déjà dans les compose).

---

## 5. Stack Portainer (détail)

### Option A — Custom Template

1. App Templates → Custom Templates → Create  
2. Colle `deploy/portainer-template.yml`  
3. Renseigne les env (JWT, SMTP, APP_URL…)  
4. Deploy

### Option B — Stack depuis Git

1. Stacks → Add stack → **Repository**  
2. Repo GitHub, ref `refs/heads/prod`  
3. Compose path : `docker-compose.yml`  
4. Env = `.env.production.example` rempli

Réseaux **externes** (déjà chez toi) :

- `nginx-proxy-manager_npm-network`
- `shared-network-copy`

---

## 6. Nginx Proxy Manager

| Champ | Valeur |
|--------|--------|
| Domain | `ytmusic.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname | `ytmusic` |
| Forward Port | `8787` |
| Websockets | **ON** |
| SSL | Let’s Encrypt + Force SSL |

---

## 7. Variables critiques

```env
JWT_SECRET=<openssl rand -hex 32>
ADMIN_EMAILS=toi@email.com
APP_URL=https://ytmusic.delhomme.ovh
WEBAUTHN_RP_ID=ytmusic.delhomme.ovh
WEBAUTHN_ORIGIN=https://ytmusic.delhomme.ovh
SMTP_PASS=…
YTMUSIC_IMAGE=ghcr.io/paveldelhomme/ytmusic:latest
```

---

## 8. Déploiement mobile — interface Admin

Dans l’app web (compte admin) → **Admin** → bloc **Déploiement mobile** :

| Action | Quand |
|--------|--------|
| **Compiler & publier** | Seulement si l’API tourne **sur une machine avec SDK** (ton PC, pas le conteneur) |
| **Uploader une APK** | **Cas Portainer** : APK buildée en local |
| QR / Télécharger | Install sur téléphone (même hors Wi‑Fi) |

### Commandes locales

```bash
# Build seule (fichier dans data/public/android/ytmusic.apk)
API_BASE_URL=https://ytmusic.delhomme.ovh make android-publish

# Build + upload vers le VPS
ADMIN_EMAIL=toi@email.com ADMIN_PASSWORD='…' make android-upload-apk

# Ou avec un token déjà connecté
ADMIN_TOKEN='eyJ…' BUILD_FIRST=0 make android-upload-apk
```

L’APK est stockée dans le volume Docker :

`/app/data/public/android/ytmusic.apk` → URL publique `/api/deploy/apk`.

---

## 9. Flux quotidien

```
feat → PR → dev → (tests)
              ↓
         merge → prod
              ↓
         GitHub Actions → image :latest
              ↓
         Portainer Pull & Redeploy   ← web à jour
              ↓
         make android-upload-apk    ← mobile à jour (quand tu veux)
```

PWA : se met à jour toute seule au prochain chargement (service worker).  
APK : il faut republier + réinstaller (ou proposer le QR aux utilisateurs).

---

## 10. Checklist go-live

- [ ] DNS `ytmusic.delhomme.ovh`
- [ ] Push `prod` → image GHCR verte
- [ ] Stack Portainer healthy (réseau npm)
- [ ] NPM + SSL + Websockets
- [ ] Login admin + passkey OK
- [ ] `make android-upload-apk` → QR Admin installable
- [ ] Volume `ytmusic_data` **non** supprimé au redeploy

---

## 11. Dépannage

| Symptôme | Fix |
|----------|-----|
| 502 NPM | Conteneur sur `npm-network`, hostname `ytmusic` |
| Pull denied GHCR | Registry + PAT `read:packages` dans Portainer |
| Admin « Compiler » KO sur VPS | Normal → **Uploader** ou `make android-upload-apk` |
| APK 404 | Pas encore uploadée → Admin ou script |
| Passkey KO | `WEBAUTHN_RP_ID` = hostname sans `https://` |
| Comptes perdus | Tu as coché Remove volumes — restore backup DB |

---

## Fichiers utiles

- `Dockerfile` / `docker-compose.yml` / `deploy/portainer-template.yml`
- `.env.production.example`
- `.github/workflows/docker.yml`
- `scripts/android-publish-apk.sh` — build local
- `scripts/publish-apk-remote.sh` — upload vers prod
- `make deploy-hint` / `make android-upload-apk`

---

## Auth / email / volume (rappel)

Voir aussi sections historiques ci-dessous + [`docs/SMTP-MAILY.md`](docs/SMTP-MAILY.md).

| Action Portainer | Données (users, APK) |
|------------------|----------------------|
| Pull & Redeploy | **Conservées** |
| Delete stack **avec** volumes | **Perdues** |

---

## 12. Auth, email, 2FA (multi-env)

| Variable | Local | Prod |
|----------|-------|------|
| `APP_ENV` | `local` | `production` |
| `APP_URL` | `http://localhost:5173` | `https://ytmusic.delhomme.ovh` |
| `SMTP_*` | maily.ovh / Mailhog | secrets Portainer |
| `COOKIE_SECURE` | `0` | `1` |

```bash
make seed-users   # comptes admin locaux
```

### Validation email

| Env | Lien |
|-----|------|
| Prod | `https://ytmusic.delhomme.ovh/verify-email?token=…` |
| Local + ADB | `make test-register-adb` |
