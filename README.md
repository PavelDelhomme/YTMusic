# YTMusic

Client YouTube Music multi-plateforme : **web**, **PWA mobile**, **desktop Electron**, avec compte utilisateur, sync bibliothèque, import YouTube et mode offline.

## Démarrage rapide

```bash
cp .env.example .env
npm install
npm run dev
```

- Web / PWA : http://localhost:5173  
- API : http://localhost:8787  

### Desktop

```bash
# Terminal 1
npm run dev

# Terminal 2
cd desktop && npm install && npm start
```

### Mobile

1. Ouvre http://localhost:5173 sur le téléphone (même réseau, ou tunnel)
2. « Ajouter à l’écran d’accueil » → PWA installable
3. Lecture arrière-plan via Media Session + cache IndexedDB

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
