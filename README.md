# YTMusic

Client YouTube Music multi-plateforme : **web**, **API**, **Android Kotlin**, **desktop Electron**.

## Structure

```
api/              Backend Express + SQLite + WS
web/              React / Vite / PWA
mobile-android/   App Android Kotlin (Compose + Media3)
desktop/          Electron
scripts/          seed, android, ops
```

## Démarrage rapide

```bash
cp .env.example .env   # comptes de test : SEED_EMAIL / SEED_PASSWORD
make install           # ou npm install
make seed-users        # crée/maj dev@ + paul@
make help
make dev               # API :8787 + Vite :5173
make android           # APK Kotlin sur device ADB
```

- Web / PWA : http://localhost:5173  
- API : http://localhost:8787  
- Prod : https://ytmusic.delhomme.ovh — DNS & install : [`docs/DNS-ET-INSTALL.md`](docs/DNS-ET-INSTALL.md)

### Desktop

```bash
# Terminal 1
make dev

# Terminal 2
cd desktop && npm install && npm start
```

### Mobile

```bash
make mobile-hint   # guide Android / iPhone
make mobile-qr     # URLs LAN
```

1. Ouvre l’URL LAN ou le domaine prod sur le téléphone  
2. Bannière « Installer » / « Comment installer » (guide selon OS)  
3. Compte app → sync biblio entre appareils (sans pubs)

## Multi-appareils & Cast

1. Connecte-toi **avec le même compte** sur PC (web/desktop) et mobile  
2. Lance un album sur le PC → la file contient tout l’album  
3. Sur mobile : bouton **Cast** → choisis l’ordinateur → contrôle play/pause/suivant/file/volume  
4. **Mode TV** : ouvre `/tv` sur la télé (navigateur) → apparaît comme appareil « Télé / TV »  
5. **Chromecast** : bouton Cast Chromecast (Chrome) envoie le flux audio  

État synchronisé : titre en cours, file d’attente, position, shuffle, repeat.


1. Crée un client OAuth (type Web) dans Google Cloud Console  
2. Origines JS autorisées : `http://localhost:5173`  
3. Mets `GOOGLE_CLIENT_ID=...` dans `.env`  
4. Redémarre le serveur  

Sans Google : inscription email / mot de passe, ou mode invité local.

## Fonctionnalités

| Zone | Détail |
|------|--------|
| Comptes | Google, email, invité device |
| Sync | Bibliothèque SQLite par utilisateur |
| Bibliothèque | Titres aimés, playlists, albums, artistes, historique |
| Import | URL / ID / recherche → titres, albums, artistes, playlists |
| Playlists | Création, édition, ajout, suppression, j’aime playlists YT |
| Offline | Cache IndexedDB + téléchargements serveur + jobs album/playlist |
| Lecture | File, shuffle, repeat, paroles, Media Session (lockscreen / arrière-plan) |
| Clients | Web responsive, PWA mobile, Electron desktop |

## Structure

```
client/    React + Vite + PWA
server/    Express + youtubei.js + SQLite
desktop/   Electron
data/      ytmusic.db + cache audio
bin/       yt-dlp
```

## Scripts

```bash
npm run dev          # API + UI
npm run build        # build client
npm run start        # API seule (sert aussi le build client)
```
