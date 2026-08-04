# Déploiement YTMusic — guide complet (état actuel → VPS)

Tu es en **local** (`APP_ENV=local`, `http://localhost:5173`).  
Objectif : site **https://ytmusic.delhomme.ovh** + APK à jour, déployable depuis **Admin** sur ton PC.

**Portainer CE** : pas de webhooks (Pro). On utilise **Watchtower** (recommandé).

| Couche | Outil |
|--------|--------|
| Image Docker | GitHub Actions → `ghcr.io/paveldelhomme/ytmusic:latest` |
| Conteneur | Portainer stack `ytmusic` |
| HTTPS | Nginx Proxy Manager (NPM) |
| MAJ auto image | Watchtower (stack séparée) |
| APK | Build sur ton PC → upload vers le volume du VPS |

---

## Phase 0 — Sur ton PC (avant tout)

### 0.1 Working tree propre

Le bouton Admin **Web** bascule sur la branche `prod`. S’il reste des fichiers non commités → erreur Git.

```bash
cd ~/Documents/Dev/Perso/YTMusic
git status
# S’il y a des M / ?? → commit (ou laisse le script stasher automatiquement)
```

Le script `admin-deploy-prod.sh` **stash** maintenant automatiquement, mais mieux vaut committer.

### 0.2 `.env` local (déjà chez toi)

Laisse `APP_ENV=local` et `APP_URL=http://127.0.0.1:8787` pour le dev.

Ajoute seulement (si absent) :

```env
DEPLOY_URL=https://ytmusic.delhomme.ovh
```

**Ne configure pas** `PORTAINER_API_KEY` / `DEPLOY_SSH` si tu choisis Watchtower (phase 4).  
Les lignes commentées B/C dans `.env` sont des *alternatives*, pas des obligations.

### 0.3 API + Vite locaux OK

```bash
make ensure-api
# + Vite : npm run dev:web  (ou make up)
curl -sS http://127.0.0.1:5173/api/health   # doit être du JSON, pas du HTML
```

Login Admin : `http://localhost:5173/admin` avec ton compte `SEED_EMAIL` / `ADMIN_EMAILS`.

---

## Phase 1 — DNS (OVH)

Sans DNS, rien ne marche (`Could not resolve host`).

1. Espace client OVH → Domaine `delhomme.ovh` → Zone DNS  
2. Ajoute (ou vérifie) :

| Type | Nom | Cible | TTL |
|------|-----|--------|-----|
| **A** | `ytmusic` | **IP publique de ton VPS** | 300 |

3. Attends 2–30 min, puis depuis ton PC :

```bash
dig +short ytmusic.delhomme.ovh
# → doit afficher l’IP du VPS (pas NXDOMAIN)
```

---

## Phase 2 — GitHub : image Docker disponible

Sur ton PC (une fois le code prêt sur `dev`) :

```bash
# Option manuelle :
git checkout dev && git pull
git checkout prod && git pull
git merge origin/dev -m "merge: promu dev → prod"
git push origin prod
```

Ou plus tard : Admin → **Web (git → image)** (fait merge + push + redeploy).

Vérifie : GitHub → repo **YTMusic** → **Actions** → workflow Docker **vert**.  
Image : `ghcr.io/paveldelhomme/ytmusic:latest`

Si le package GHCR est **privé** : dans Portainer → **Registries** → add GitHub / GHCR avec un PAT `read:packages`.

---

## Phase 3 — Première stack `ytmusic` sur Portainer (VPS)

### 3.1 Ouvre Portainer

URL habituelle (ex. `https://portainer.delhomme.ovh` ou `:9443`).

### 3.2 Créer la stack (Web editor — le plus fiable)

1. **Stacks** → **Add stack**  
2. **Name** : `ytmusic`  
3. **Build method** : **Web editor**  
4. Colle **tout** le fichier [`deploy/portainer-template.yml`](deploy/portainer-template.yml) du repo  
5. Section **Environment variables** → ajoute **une par une** :

| Name | Value (exemple) |
|------|------------------|
| `JWT_SECRET` | sortie de `openssl rand -hex 32` (**différent** du local) |
| `SMTP_PASS` | mot de passe maily (comme ton SMTP local) |
| `ADMIN_EMAILS` | `dev@delhomme.ovh` (ou ton email) |
| `AUTH_ALLOWED_EMAILS` | **même** email |
| `AUTH_ALLOW_REGISTER` | `0` |
| `AUTH_ALLOW_GUEST` | `0` |
| `APP_URL` | `https://ytmusic.delhomme.ovh` |
| `WEBAUTHN_RP_ID` | `ytmusic.delhomme.ovh` |
| `WEBAUTHN_ORIGIN` | `https://ytmusic.delhomme.ovh` |
| `YTMUSIC_IMAGE` | `ghcr.io/paveldelhomme/ytmusic:latest` |
| `SMTP_HOST` | `ssl0.ovh.net` |
| `SMTP_USER` | `noreply@maily.ovh` |
| `SMTP_FROM` | `YTMusic <noreply@maily.ovh>` |

6. **Deploy the stack**  
7. Conteneur `ytmusic` → statut **healthy** (healthcheck `/api/health`)

### 3.3 Réseaux Docker (déjà sur ton serveur)

Le compose attend ces réseaux **externes** (comme tes autres apps) :

- `nginx-proxy-manager_npm-network`
- `shared-network-copy`

S’ils n’existent pas : crée-les dans Portainer → Networks, ou aligne les `name:` du YAML sur tes vrais noms.

### 3.4 Ne jamais cocher « Remove volumes »

Sinon tu perds SQLite (comptes) + APK.

---

## Phase 4 — Watchtower (MAJ auto sans Pro)

**Une seule fois.**

1. Portainer → **Stacks** → **Add stack**  
2. Name : `watchtower`  
3. Colle [`deploy/watchtower-compose.yml`](deploy/watchtower-compose.yml)  
4. Deploy  

Le conteneur `ytmusic` a déjà :

`com.centurylinklabs.watchtower.enable=true`

→ Watchtower poll toutes les **5 min**, pull `ghcr.io/…/ytmusic:latest` si nouveau digest, recrée le conteneur, **garde** le volume.

Après ça, tu n’as **rien** à mettre dans `.env` pour le redeploy VPS : Admin **Web** pousse `prod` → CI build → Watchtower met à jour.

*(Alternatives documentées plus bas : Access Token / SSH — optionnelles.)*

---

## Phase 5 — Nginx Proxy Manager (HTTPS)

Comme pour `taskflow` / tes autres apps.

1. NPM → **Proxy Hosts** → **Add Proxy Host**  
2. Remplis **exactement** :

| Champ | Valeur |
|--------|--------|
| Domain Names | `ytmusic.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname | `ytmusic` ← **container_name** Docker |
| Forward Port | `8787` |
| Cache Assets | off (ou on, peu importe) |
| Block Common Exploits | on (ok) |
| Websockets Support | **ON** (obligatoire pour `/ws`) |
| SSL | **Request a new SSL Certificate** |
| Force SSL | **ON** |
| HTTP/2 | on |
| Email Let’s Encrypt | ton email |

3. Save  
4. Test :

```bash
curl -fsS https://ytmusic.delhomme.ovh/api/health
# → {"ok":true,...}
```

**502** = mauvais hostname/réseau (conteneur pas sur `npm-network`, ou nom ≠ `ytmusic`).

---

## Phase 6 — Premier compte admin sur le VPS

L’inscription est fermée (`AUTH_ALLOW_REGISTER=0`).

**Méthode simple (une fois) :**

1. Portainer → stack `ytmusic` → Editor → env : `AUTH_ALLOW_REGISTER=1`  
2. Update / redeploy (**sans** Remove volumes)  
3. Ouvre `https://ytmusic.delhomme.ovh` → **Créer un compte** avec l’email de `AUTH_ALLOWED_EMAILS`  
4. Remets `AUTH_ALLOW_REGISTER=0` → Update  

Login OK → tu es admin si l’email est dans `ADMIN_EMAILS`.

---

## Phase 7 — Déploiements quotidiens depuis ton PC

### 7.1 Console Admin locale

1. `http://localhost:5173` → connecte-toi  
2. **Admin / Paramètres**  
3. Bloc **Mise en production (depuis ce PC)**  

| Bouton | Quand | Ce que ça fait |
|--------|--------|----------------|
| **Web (git → image)** | Changement web/API | stash si besoin → push branche → merge → `dev` → `prod` → attend CI → tente redeploy (Watchtower suffit si déjà installé) |
| **APK → VPS** | Nouvelle app mobile | build APK pointant vers `DEPLOY_URL` + upload sur le VPS |
| **Web + APK** | Les deux | enchaîne |
| **Réparer client local** | UI locale bizarre | vide SW / caches |

**Redeploy VPS** dans l’UI affiche « Watchtower (auto)… » tant que tu n’as pas mis SSH/API — **c’est normal** avec Watchtower.

### 7.2 Première APK prod

Quand le site HTTPS répond :

```bash
# ou bouton Admin « APK → VPS »
ADMIN_EMAIL=dev@delhomme.ovh ADMIN_PASSWORD='…' make android-upload-apk
```

Puis sur le **site prod** (ou Admin local après upload) : QR /  
`https://ytmusic.delhomme.ovh/api/deploy/apk`

---

## Checklist « tout est en ligne »

- [ ] `dig +short ytmusic.delhomme.ovh` → IP VPS  
- [ ] Actions GitHub Docker vert sur `prod`  
- [ ] Stack Portainer `ytmusic` **healthy**  
- [ ] Stack `watchtower` running  
- [ ] NPM : domaine + SSL + **Websockets ON** → `ytmusic:8787`  
- [ ] `curl https://ytmusic.delhomme.ovh/api/health` → JSON ok  
- [ ] Login avec ton email allowlisté  
- [ ] Admin local → **Web** ne plante plus sur « modifications locales »  
- [ ] APK uploadée → `/api/deploy/apk` téléchargeable  

---

## Alternatives Watchtower (optionnel)

### B — Access Token Portainer CE

Profil Portainer → **Access tokens** → Add → dans `.env` **local** :

```env
PORTAINER_URL=https://portainer.ton-domaine
PORTAINER_API_KEY=ptr_…
PORTAINER_STACK_NAME=ytmusic
```

Admin **Web** appellera alors l’API (pull + redeploy) juste après le build.

### C — SSH

```env
DEPLOY_SSH=user@IP_VPS
DEPLOY_SSH_CMD=docker pull ghcr.io/paveldelhomme/ytmusic:latest && docker restart ytmusic
```

Clé SSH sans mot de passe (`ssh-copy-id`).

---

## Dépannage rapide

| Problème | Cause / fix |
|----------|-------------|
| `modifications locales… écrasées` | Commit ou laisse le stash auto du script |
| NXDOMAIN / resolve host | Phase 1 DNS |
| 502 NPM | Hostname `ytmusic`, réseau npm, conteneur up |
| Pull denied GHCR | Registry + PAT `read:packages` |
| Conteneur pas à jour | Watchtower absent → déploie phase 4, ou Pull manuel UI |
| Webhook | **Pro only** — on n’utilise pas |
| Inscription refusée | Normal → phase 6 |
| Volume vide après update | Tu as coché Remove volumes |

---

## Fichiers utiles

| Fichier | Rôle |
|---------|------|
| [`deploy/portainer-template.yml`](deploy/portainer-template.yml) | Stack `ytmusic` |
| [`deploy/watchtower-compose.yml`](deploy/watchtower-compose.yml) | MAJ auto |
| [`scripts/admin-deploy-prod.sh`](scripts/admin-deploy-prod.sh) | Boutons Admin |
| [`scripts/redeploy-vps.sh`](scripts/redeploy-vps.sh) | SSH / API CE / hint Watchtower |
| [`.env.production.example`](.env.production.example) | Variables stack |
| [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | Build image |

```bash
make deploy-hint
```
