# Système de recommandations PLM

> Objectif : une radio / accueil / explore / similaires **personnels**, sans pubs, avec compte obligatoire et feedback continu.  
> Stack actuelle : Node/SQLite + youtubei.js. Couches ML avancées (CLAP, FAISS, Transformer) = phases 2–3.

---

## 1. Principes

1. **Compte obligatoire** — profil, préférences, historique, feedback. Pas d’expérience « invité » pour la reco.
2. **Architecture hybride** — 4 (+1) scores en parallèle, puis cascade Scoring → Re-ranking.
3. **Onboarding** — si préférences vides → wizard (genres, artistes, ambiances, moment d’écoute).
4. **Feedback** — like / skip &lt;15s / écoute complète / « bonne / mauvaise proposition » → ajuste les poids.
5. **Admin** — visualiser poids, candidate pools, feedback agrégé ; forcer un mode (Radio / Découverte).

---

## 2. Les 4 (+1) algorithmes

```
┌─────────────────────────────────────────────────────────┐
│  1. Contenu (vectoriel / métadonnées)                   │  Similarité globale
├─────────────────────────────────────────────────────────┤
│  2. Séquentiel (Markov → plus tard Transformer)         │  Enchaînement fluide
├─────────────────────────────────────────────────────────┤
│  3. Contextuel (heure / jour / appareil)                │  Pertinence du moment
├─────────────────────────────────────────────────────────┤
│  4. Bandit (UCB / exploration)                          │  Nouveautés
├─────────────────────────────────────────────────────────┤
│  5. Satisfaction (feedback online)                      │  Skip / complete / like
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              Scoring hybride + Re-ranking
```

### Phase 1 (livrée dans le code)

| Algo | Implémentation actuelle |
|------|-------------------------|
| Contenu | Similarité sur tags/genre/artiste + voisins youtubei `related`/`radio` |
| Markov | Soft distance sur « énergie estimée » (proxy via titre/tags) + tempo proxy |
| Contexte | Boost selon tranche horaire / week-end vs profil utilisateur |
| Bandit | ε-greedy sur titres peu/pas écoutés dans le candidate pool |
| Satisfaction | Pénalité skip rapide, boost complete + like |

### Phase 2 (prévue)

- Embeddings audio (OpenL3 / CLAP) + index FAISS/Qdrant local
- Features BPM/énergie/valence via librosa/essentia (job offline)
- Modèle séquentiel léger (GRU / SASRec) sur sessions

### Phase 3

- MMR / DPP pour diversité
- Satisfaction online (SGD)
- Signaux météo / activité (« sport », « focus »)
- Playlists publiques comme « collab déguisée »

---

## 3. Pipeline cascade

```
Catalogue / Innertube related (~50–200 candidats)
        │
        ▼  A. Candidate selection
Pool 100
        │
        ▼  B. Score hybride S(m) = Σ wᵢ · Scoreᵢ
Scorés
        │
        ▼  C. Re-ranking anti-fatigue
File 10–40 (radio / à suivre / home shelves)
```

### Poids par mode

| Mode | w_contenu | w_seq | w_ctx | w_bandit | w_satisf |
|------|-----------|-------|-------|----------|----------|
| Radio | 0.35 | 0.25 | 0.20 | 0.10 | 0.10 |
| Découverte | 0.20 | 0.15 | 0.15 | 0.35 | 0.15 |
| Focus (focus/lofi) | 0.40 | 0.30 | 0.20 | 0.05 | 0.05 |

Les poids sont stockés en DB (`reco_weights`) et éditables en Admin.

### Re-ranking

1. Pénalité récence : \( S' = S · (1 - e^{-Δt/τ}) \) (τ ≈ 24h)
2. Max 1× même artiste dans les 3 derniers slots
3. Skip &lt;15s → inversion locale (downrank voisins du skip)
4. Diversité légère (MMR proxy : distance tags)

---

## 4. Données utilisateur

| Table / concept | Rôle |
|-----------------|------|
| `user_prefs` | Genres, ambiances, moments, onboarding_done |
| `artist_follows` | Abonnements artistes |
| `listen_events` | start, progress%, complete, skip_ms, seed_id |
| `search_history` | Requêtes + clics résultat |
| `pins` | Épingles accueil (track/album/playlist) |
| `reco_feedback` | good/bad sur une proposition |
| `reco_weights` | Poids par mode (global + override user) |

Historique « écouté complètement » vs « juste démarré » : `listen_events.completed` + `progress_pct`.

---

## 5. Surfaces produit

| Surface | Source reco |
|---------|-------------|
| Accueil | Pins + prefs + historique + shelves Innertube re-rankés |
| Explorer | Moods/radios (focus, sport, soirée…) + bandit |
| Similaires / À suivre | Pipeline hybride seed = titre courant |
| Radios | Catégories fixes (Focus, Sport, Chill, Party, Night, Discover…) |
| Recherche | Suggestions = historique + prefs + Innertube suggest |

---

## 6. Onboarding & feedback

1. Premier login réel → wizard (genres ≥3, artistes ≥3, moments).
2. Pendant l’écoute → thumbs / « bonne reco ? » occasionnel.
3. Skip rapide → feedback négatif implicite.
4. Admin `/admin` → onglet Reco (poids, stats feedback, mode forcé).

---

## 7. Radios automatiques

Catégories initiales : `focus`, `chill`, `workout`, `party`, `night`, `morning`, `discover`, `liked-radio`, `artist-radio`.

Chaque radio = seed (query ou artiste) + mode de poids + filtres contexte.

---

## 8. API (phase 1)

```
GET  /api/prefs
PUT  /api/prefs
POST /api/prefs/onboarding
GET  /api/pins
POST /api/pins
DELETE /api/pins/:id
POST /api/listen   { trackId, event, progressPct, seedId? }
GET  /api/history/detailed
POST /api/search/history
GET  /api/search/history
GET  /api/reco/home
GET  /api/reco/explore
GET  /api/reco/similar/:trackId
GET  /api/reco/radio/:category
POST /api/reco/feedback
GET  /api/admin/reco
PUT  /api/admin/reco/weights
GET  /api/artists/:id/follow  POST/DELETE follow
```

---

## 9. Monitoring & ops

```bash
make status         # ports, health, mode (dev/prod), LAN
make status-watch   # rafraîchissement périodique
make logs           # logs docker ytmusic (+ mailhog)
make mobile-adb     # ouvre l’app LAN sur device ADB
make deploy-hint
make push-dev / push-prod
```

---

## 10. Roadmap

| Phase | Contenu | Statut |
|-------|---------|--------|
| 1 | Prefs, listen events, hybrid scoring léger, radios, pins, feedback, admin poids, compte obligatoire | **Livré (socle)** |
| 2 | Embeddings + FAISS, features audio offline | Planifié |
| 3 | Transformer session, MMR/DPP, collab playlists publiques | Planifié |

Voir aussi : `DEPLOY.md`, `docs/DNS-ET-INSTALL.md`, `.cursor/rules/git-branches.mdc`.
