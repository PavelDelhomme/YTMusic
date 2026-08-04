# Déploiement YTMusic — à suivre dans l’ordre

**État actuel typique :** tu es en local, tu as aligné `.env` / `.env.example`,  
tu as **`DEPLOY_URL=https://ytmusic.delhomme.ovh`**.  
Tu n’as **pas encore** créé la stack Portainer / NPM / Watchtower / DNS.

**Ne configure pas** `PORTAINER_API_KEY` ni `DEPLOY_SSH` pour l’instant.  
On utilise **Watchtower** (gratuit, Portainer CE, sans webhook Pro).

Après la **première mise en ligne** (étapes 1 → 7), tu ne feras plus que  
l’étape **8** (boutons Admin sur ton PC).

---

## Checklist première mise en ligne

Coche au fur et à mesure. **Ne saute aucune étape.**

### ☐ 1. DNS OVH (obligatoire en premier)

Sans ça : `Could not resolve host` partout.

1. Va sur [OVH](https://www.ovh.com/manager/) → Domaines → **`delhomme.ovh`** → Zone DNS  
2. **Ajouter une entrée** :

| Type | Sous-domaine / Nom | Cible | TTL |
|------|--------------------|--------|-----|
| **A** | `ytmusic` | **IP publique de ton VPS** (celle de ton serveur) | 300 |

3. Enregistre. Attends quelques minutes.  
4. Sur ton PC :

```bash
dig +short ytmusic.delhomme.ovh
```

✅ OK si tu vois l’IP du VPS.  
❌ Si vide / NXDOMAIN → attends encore, ou corrige l’entrée DNS. **N’avance pas.**

---

### ☐ 2. Image Docker déjà sur GitHub (une fois)

Sur ton PC :

```bash
cd ~/Documents/Dev/Perso/YTMusic
git status          # working tree propre de préférence
git checkout dev && git pull origin dev
git checkout prod && git pull origin prod
git merge origin/dev -m "merge: promu dev → prod"
git push origin prod
```

1. Ouvre GitHub → repo **YTMusic** → onglet **Actions**  
2. Attends que le workflow **Docker** sur `prod` soit **vert**  
3. Image produite : `ghcr.io/paveldelhomme/ytmusic:latest`

Si GHCR est **privé** : Portainer → **Registries** → ajoute GitHub avec un PAT  
ayant le droit `read:packages`.

**Mieux (recommandé) : package en Public** — repo public ≠ image publique.

1. Ouvre : https://github.com/users/PavelDelhomme/packages/container/ytmusic/settings  
   (ou repo YTMusic → panneau droit **Packages** → `ytmusic` → **Package settings**)  
2. **Danger Zone** / Change visibility → **Public** → confirmer  
3. Réessaie le Deploy de la stack Portainer (plus besoin de registry login)

---

### ☐ 3. Stack Portainer `ytmusic` (le conteneur)

1. Ouvre **Portainer** (comme pour tes autres apps)  
2. **Stacks** → **Add stack**  
3. **Name** : `ytmusic`  
4. **Web editor** (pas Git si ça t’a déjà embêté)  
5. Ouvre sur ton PC le fichier  
   `deploy/portainer-template.yml`  
   → **tout sélectionner** → coller dans l’éditeur Portainer  
6. Plus bas : **Environment variables** → **Add an environment variable**  
   pour **chaque** ligne :

| Name | Value |
|------|--------|
| `JWT_SECRET` | lance `openssl rand -hex 32` et colle le résultat (**pas** le secret local) |
| `SMTP_PASS` | le même mot de passe maily que dans ton `.env` local |
| `ADMIN_EMAILS` | `dev@delhomme.ovh` (ou ton email) |
| `AUTH_ALLOWED_EMAILS` | **identique** à `ADMIN_EMAILS` |
| `AUTH_ALLOW_REGISTER` | `0` |
| `AUTH_ALLOW_GUEST` | `0` |
| `APP_URL` | `https://ytmusic.delhomme.ovh` |
| `WEBAUTHN_RP_ID` | `ytmusic.delhomme.ovh` |
| `WEBAUTHN_ORIGIN` | `https://ytmusic.delhomme.ovh` |
| `YTMUSIC_IMAGE` | `ghcr.io/paveldelhomme/ytmusic:latest` |
| `SMTP_HOST` | `ssl0.ovh.net` |
| `SMTP_USER` | `noreply@maily.ovh` |
| `SMTP_FROM` | `YTMusic <noreply@maily.ovh>` |

7. **Deploy the stack**  
8. Onglet Containers : `ytmusic` doit passer **healthy** / running  

**Réseaux** (déjà chez toi en principe) :  
`nginx-proxy-manager_npm-network` et `shared-network-copy`.  
Si Portainer refuse le deploy → Networks : vérifie que ces noms existent  
(ou adapte les `name:` en bas du YAML comme sur tes autres stacks).

⚠️ Ne **jamais** cocher « Remove volumes » plus tard.

---

### ☐ 4. Stack Portainer `watchtower` (MAJ auto)

**Une seule fois.** C’est ça qui remplace les webhooks Pro.

1. Portainer → **Stacks** → **Add stack**  
2. **Name** : `watchtower`  
3. Colle le contenu de `deploy/watchtower-compose.yml`  
4. **Deploy**  

Tu n’ajoutes **rien** dans ton `.env` local pour Watchtower.  
Les commentaires A/B/C dans `.env` : ignore B et C.

---

### ☐ 5. Nginx Proxy Manager (HTTPS)

1. Ouvre **Nginx Proxy Manager**  
2. **Proxy Hosts** → **Add Proxy Host**  
3. Onglet **Details** :

| Champ | Valeur exacte |
|--------|----------------|
| Domain Names | `ytmusic.delhomme.ovh` |
| Scheme | `http` |
| Forward Hostname / IP | `ytmusic` |
| Forward Port | `8787` |
| Websockets Support | **ON** |
| Block Common Exploits | ON (ok) |

4. Onglet **SSL** :

| Champ | Valeur |
|--------|--------|
| SSL Certificate | Request a new SSL Certificate |
| Force SSL | **ON** |
| HTTP/2 | ON |
| Email | ton email Let’s Encrypt |
| Agree Let’s Encrypt | coché |

5. **Save**

Test sur ton PC :

```bash
curl -fsS https://ytmusic.delhomme.ovh/api/health
```

✅ Tu dois voir du JSON avec `"ok":true`.  
❌ **502** → conteneur pas sur le réseau NPM, ou Forward Hostname ≠ `ytmusic`.  
❌ certificat KO → DNS pas encore propagé (reviens à l’étape 1).

---

### ☐ 6. Créer ton compte sur le site prod (une fois)

L’inscription est fermée par défaut.

1. Portainer → stack **ytmusic** → **Editor**  
2. Dans les env : mets `AUTH_ALLOW_REGISTER` = `1`  
3. **Update the stack** (**sans** Remove volumes)  
4. Navigateur : `https://ytmusic.delhomme.ovh` → **Créer un compte**  
   avec l’email de `AUTH_ALLOWED_EMAILS` (ex. `dev@delhomme.ovh`)  
5. Remets `AUTH_ALLOW_REGISTER` = `0` → Update  

Connecte-toi → OK.

---

### ☐ 7. Première APK (quand le site HTTPS marche)

Sur ton PC (Android SDK) :

```bash
cd ~/Documents/Dev/Perso/YTMusic
ADMIN_EMAIL=dev@delhomme.ovh ADMIN_PASSWORD='ton-mot-de-passe' make android-upload-apk
```

Ou : `http://localhost:5173/admin` → **APK → VPS**.

Puis téléphone : ouvre / scanne  
`https://ytmusic.delhomme.ovh/api/deploy/apk`

---

### ☐ 8. Ensuite : tout contrôler depuis ton PC

**Quotidien / chaque release :**

1. Lance l’API + Vite en local si besoin (`make ensure-api`, `npm run dev:web`)  
2. `http://localhost:5173` → login → **Admin**  
3. Bloc **Mise en production** :

| Bouton | Effet |
|--------|--------|
| **Web (git → image)** | envoie le code → `prod` → build Docker → Watchtower met à jour le VPS (~5 min) |
| **APK → VPS** | recompile + upload l’APK sur le serveur |
| **Web + APK** | les deux d’un coup |

Tu n’as **plus** à toucher Portainer pour une MAJ normale (sauf souci).

---

## Rappel `.env` local (déjà fait)

```env
APP_ENV=local
APP_URL=http://127.0.0.1:8787
DEPLOY_URL=https://ytmusic.delhomme.ovh
```

Laisse B/C (Portainer API / SSH) **commentés**. Watchtower suffit.

---

## Dépannage

| Symptôme | Que faire |
|----------|-----------|
| `Could not resolve host` | Étape 1 DNS pas OK |
| Deploy Admin : fichiers locaux | `git commit` ou laisse le stash auto |
| 502 NPM | Étape 5 : hostname `ytmusic`, port `8787`, Websockets |
| Pull denied image | Registry GHCR + PAT `read:packages` |
| Conteneur pas à jour après Web | Étape 4 Watchtower absente, ou attendre 5 min, ou Pull manuel |
| Inscription impossible | Étape 6 : `AUTH_ALLOW_REGISTER=1` temporaire |
| Données perdues | Tu as coché Remove volumes |

---

## Fichiers à coller dans Portainer

| Stack | Fichier du repo |
|-------|------------------|
| `ytmusic` | `deploy/portainer-template.yml` |
| `watchtower` | `deploy/watchtower-compose.yml` |

```bash
make deploy-hint
```
