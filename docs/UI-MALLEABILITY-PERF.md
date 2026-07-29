# UI malléable & perf énergie

## Malléabilité (mobile Now Playing)

Les rangées d’actions du lecteur plein écran sont pilotées par des **listes ordonnées** dans
`mobile-android/.../ui/player/NowPlayingChrome.kt` :

- `secondaryActions` — sous titre/artiste (j’aime, paroles, playlist, DL, mix…)
- `transportActions` — sous le seek (aléatoire, précédent, play, suivant, boucle)
- `topBarActions` — Cast + ⋮

Pour **ajouter / retirer / réordonner** un bouton : éditer la liste `ChromeSlot` correspondante,
puis brancher le `when (slot.id)` dans `NowPlayingScreen.kt` si c’est une nouvelle action
(`PlayerChromeAction`).

Même principe pour le menu ⋮ (`TrackActionsSheet`) : actions en liste séquentielle, faciles à
déplacer.

## Note perf / énergie (à faire)

Tracer et réduire la conso **web**, **mobile** et **serveur** :

| Surface | Pistes | Statut |
|---------|--------|--------|
| Web | Media Session / polling, timers player, re-renders, lazy images, wake lock | ⏳ |
| Mobile | tick lecteur (400–500 ms), Coil cache, Media3 foreground service, wake locks | ⏳ |
| API / YT | cache Innertube, rate-limit, logs volume, jobs reco | ⏳ |

Livrable cible : métriques simples (CPU idle player, appels API/min, taille payloads) + budget
documenté. Pas de télémétrie PII sans opt-in.
