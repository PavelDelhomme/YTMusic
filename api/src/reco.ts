import type { Track } from './types.js';
import { getRelated, getTrack, search } from './yt.js';
import {
  getPrefs,
  getWeights,
  listFollows,
  listListenEvents,
  listPins,
  listSearchHistory,
} from './prefs.js';
import {
  getForgottenFavorites,
  getHistory,
  getTopListened,
  getEntityHistory,
  getLibraryTasteTracks,
  getLikedTrackIds,
} from './library.js';

export const RADIO_CATEGORIES = [
  { id: 'focus', title: 'Concentration', query: 'focus concentration playlist', mode: 'focus' },
  { id: 'chill', title: 'Détente', query: 'chill lo-fi playlist', mode: 'radio' },
  { id: 'workout', title: 'Sport', query: 'workout energy playlist', mode: 'radio' },
  { id: 'party', title: 'Fête', query: 'party hits playlist', mode: 'radio' },
  { id: 'night', title: 'Sommeil', query: 'late night jazz chill', mode: 'radio' },
  { id: 'morning', title: 'Bonne humeur', query: 'morning acoustic pop', mode: 'radio' },
  { id: 'discover', title: 'Nouveautés', query: 'new music friday indie', mode: 'discover' },
  /** Radio seedée sur les tops écoutés — distinct du rayon Accueil « Favoris à redécouvrir ». */
  { id: 'liked-radio', title: 'Radio J’aime', query: '', mode: 'radio' },
] as const;

function hourBucket(h: number) {
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

const STYLE_TAGS: { re: RegExp; tag: string }[] = [
  { re: /lo-?fi|chillhop/, tag: 'lofi' },
  { re: /\bjazz\b|bossa|swing/, tag: 'jazz' },
  { re: /\brap\b|hip.?hop|drill|trap\b/, tag: 'hiphop' },
  { re: /\brock\b|metal|punk|grunge/, tag: 'rock' },
  { re: /\bedm\b|house|techno|trance|dnb|drum.?and.?bass/, tag: 'electronic' },
  { re: /r&b|rnb|\bsoul\b|neo.?soul/, tag: 'rnb' },
  { re: /\bpop\b|synthpop/, tag: 'pop' },
  { re: /\bindie\b|alternative|alt\b/, tag: 'indie' },
  { re: /latin|reggaeton|salsa|bachata/, tag: 'latin' },
  { re: /afro|afrobeats|amapiano/, tag: 'afro' },
  { re: /classical|piano|orchestr|symphony/, tag: 'classical' },
  { re: /\bcountry\b|bluegrass/, tag: 'country' },
  { re: /k-?pop|j-?pop/, tag: 'kpop' },
  { re: /\bfolk\b|acoustic|singer.?songwriter/, tag: 'folk' },
  { re: /\bgospel\b/, tag: 'gospel' },
  { re: /\bblues\b/, tag: 'blues' },
  { re: /\bfunk\b|disco|groove/, tag: 'funk' },
  { re: /ambient|chill|sleep|calm|relax/, tag: 'chill' },
  { re: /dance|party|club/, tag: 'dance' },
  { re: /reggae|dancehall/, tag: 'reggae' },
];

function trackBlob(t: Track) {
  return `${t.title} ${(t.artists || []).map((a) => a.name).join(' ')}`.toLowerCase();
}

function energyProxy(t: Track): number {
  const blob = trackBlob(t);
  let e = 0.5;
  if (/chill|lofi|lo-fi|acoustic|piano|sleep|calm|jazz|ambient|bossa/.test(blob)) e -= 0.25;
  if (/workout|party|dance|edm|metal|rock|rap|drill|hard|trap|techno/.test(blob)) e += 0.25;
  return Math.max(0, Math.min(1, e));
}

function styleTags(t: Track): string[] {
  const blob = trackBlob(t);
  const tags = STYLE_TAGS.filter((x) => x.re.test(blob)).map((x) => x.tag);
  return [...new Set(tags)];
}

/** Requête search pour élargir le pool « même vibe, autres artistes ». */
export function styleSearchQuery(seed: Track): string {
  const tags = styleTags(seed);
  const artist = seed.artists?.[0]?.name?.trim();
  const cleanTitle = seed.title
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics|hd|4k|remaster(ed)?|live|feat\.?|ft\.?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(' ');
  if (tags.length) {
    return `${tags.slice(0, 2).join(' ')} songs like ${cleanTitle || artist || 'hits'}`.trim();
  }
  if (artist && cleanTitle) return `${cleanTitle} similar songs playlist`;
  return `${artist || cleanTitle || 'similar'} mix playlist`.trim();
}

function artistKey(t: Track) {
  return (t.artists?.[0]?.id || t.artists?.[0]?.name || '').toLowerCase();
}

function scoreContent(candidate: Track, seed: Track | null, prefsGenres: string[]) {
  let s = 0.28;
  if (seed) {
    const sameArtist = artistKey(candidate) && artistKey(candidate) === artistKey(seed);
    // Léger bonus même artiste — la variété de style prime (YTM-like)
    if (sameArtist) s += 0.08;
    else {
      const seedTags = styleTags(seed);
      const candTags = styleTags(candidate);
      const overlap = seedTags.filter((t) => candTags.includes(t)).length;
      if (overlap) s += Math.min(0.42, overlap * 0.18);
      else {
        // Pas de tag explicite : proximité d’énergie = proxy de style
        const d = Math.abs(energyProxy(candidate) - energyProxy(seed));
        s += Math.max(0, 0.22 - d * 0.4);
      }
    }
    const titleOverlap = seed.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && candidate.title.toLowerCase().includes(w)).length;
    s += Math.min(0.12, titleOverlap * 0.04);
  }
  const blob = trackBlob(candidate);
  for (const g of prefsGenres) {
    if (g && blob.includes(g.toLowerCase())) s += 0.1;
  }
  return Math.min(1, s);
}

function scoreSeq(candidate: Track, seed: Track | null) {
  if (!seed) return 0.5;
  const d = Math.abs(energyProxy(candidate) - energyProxy(seed));
  return Math.exp(-d / 0.25);
}

function scoreCtx(candidate: Track, moments: string[], hour: number, weekend: boolean) {
  const bucket = hourBucket(hour);
  let s = 0.4;
  if (moments.includes(bucket) || moments.includes(weekend ? 'weekend' : 'weekday')) s += 0.25;
  const e = energyProxy(candidate);
  if (bucket === 'night' || bucket === 'evening') s += (1 - e) * 0.2;
  if (bucket === 'morning' || bucket === 'afternoon') s += e * 0.15;
  return Math.min(1, s);
}

function scoreBandit(trackId: string, listenCounts: Map<string, number>, bias: number) {
  const n = listenCounts.get(trackId) || 0;
  // UCB-ish: peu écouté = bonus
  return Math.min(1, bias + 1 / (1 + n));
}

function scoreSatisf(
  trackId: string,
  skips: Set<string>,
  completes: Set<string>,
  likes: Set<string>,
) {
  if (skips.has(trackId)) return 0.15;
  if (likes.has(trackId)) return 0.95;
  if (completes.has(trackId)) return 0.8;
  return 0.5;
}

/** Proximité seed ↔ titre biblio (réutilise scoreContent sans prefs). */
function proximityToSeed(candidate: Track, seed: Track) {
  return scoreContent(candidate, seed, []);
}

/** Titres de la biblio proches du seed (même vibe / artiste / énergie). */
function pickLibraryNearSeed(seed: Track, library: Track[], max: number): Track[] {
  return library
    .filter((t) => t?.id && t.id !== seed.id)
    .map((t) => ({ t, s: proximityToSeed(t, seed) }))
    .filter((x) => x.s >= 0.34)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t);
}

/** Artistes de la biblio alignés sur le style du seed (pour élargir le pool). */
function pickTasteArtists(seed: Track, library: Track[], max: number): string[] {
  const seedTags = styleTags(seed);
  const seedA = artistKey(seed);
  const scored = new Map<string, { name: string; s: number }>();
  for (const t of library) {
    const name = t.artists?.[0]?.name?.trim();
    const key = artistKey(t);
    if (!name || !key || key === seedA) continue;
    let s = 0.2;
    if (seedTags.length) {
      const overlap = seedTags.filter((tag) => styleTags(t).includes(tag)).length;
      s += overlap * 0.28;
    } else {
      const d = Math.abs(energyProxy(t) - energyProxy(seed));
      s += Math.max(0, 0.25 - d * 0.45);
    }
    const prev = scored.get(key);
    if (!prev || s > prev.s) scored.set(key, { name, s });
  }
  return [...scored.values()]
    .filter((x) => x.s >= 0.35)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.name);
}

function rerank(
  scored: { track: Track; score: number }[],
  recentArtist: string[],
  opts?: { window?: number; seedArtist?: string },
) {
  const window = opts?.window ?? 5;
  const seedArtist = opts?.seedArtist || '';
  const out: { track: Track; score: number }[] = [];
  const usedArtists: string[] = [...recentArtist];
  const pool = [...scored].sort((a, b) => b.score - a.score);
  let seedArtistHits = 0;
  while (pool.length && out.length < 48) {
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      const a = artistKey(pool[i].track);
      const recent = usedArtists.slice(-window);
      if (a && recent.includes(a)) continue;
      // Cap : pas plus d’1 titre sur 4 du seed artist (variété)
      if (seedArtist && a === seedArtist && seedArtistHits >= Math.max(1, Math.floor(out.length / 4) + 1)) {
        continue;
      }
      idx = i;
      break;
    }
    const pick = pool.splice(idx, 1)[0];
    out.push(pick);
    const a = artistKey(pick.track);
    if (a) {
      usedArtists.push(a);
      if (a === seedArtist) seedArtistHits += 1;
    }
  }
  return out.map((x) => x.track);
}

export async function hybridRank(opts: {
  userId: string;
  candidates: Track[];
  seed?: Track | null;
  mode?: string;
}): Promise<Track[]> {
  const prefs = getPrefs(opts.userId);
  const mode =
    opts.mode ||
    (prefs.discoveryBias > 0.25 ? 'discover' : 'radio');
  const w = getWeights(mode);
  const now = new Date();
  const hour = now.getHours();
  const weekend = now.getDay() === 0 || now.getDay() === 6;

  const events = listListenEvents(opts.userId, 400) as any[];
  const listenCounts = new Map<string, number>();
  const skips = new Set<string>();
  const completes = new Set<string>();
  for (const e of events) {
    listenCounts.set(e.track_id, (listenCounts.get(e.track_id) || 0) + 1);
    if (e.event === 'skip') skips.add(e.track_id);
    if (e.event === 'complete') completes.add(e.track_id);
  }
  // Likes réels + tops écoutés (proxy)
  const likes = new Set<string>([
    ...getLikedTrackIds(opts.userId, 300),
    ...getTopListened(opts.userId, 100).map((t) => t.id),
  ]);
  const tasteArtists = new Set(
    getLibraryTasteTracks(opts.userId, 100)
      .map((t) => artistKey(t))
      .filter(Boolean),
  );

  // pénalité récence < 6h
  const recent = new Set(
    events
      .filter((e) => Date.now() - e.created_at < 6 * 3600 * 1000)
      .map((e) => e.track_id),
  );

  const seed = opts.seed || null;
  const scored = opts.candidates
    .filter((t) => t?.id && /^[a-zA-Z0-9_-]{11}$/.test(t.id))
    .filter((t) => !seed || t.id !== seed.id)
    .map((track) => {
      const s1 = scoreContent(track, seed, prefs.genres);
      const s2 = scoreSeq(track, seed);
      const s3 = scoreCtx(track, prefs.moments, hour, weekend);
      const s4 = scoreBandit(track.id, listenCounts, prefs.discoveryBias);
      const s5 = scoreSatisf(track.id, skips, completes, likes);
      let s =
        w.w_content * s1 +
        w.w_seq * s2 +
        w.w_ctx * s3 +
        w.w_bandit * s4 +
        w.w_satisf * s5;
      // Affinité biblio : artiste déjà dans likes / playlists / sauvés
      const a = artistKey(track);
      if (a && tasteArtists.has(a)) s += 0.07;
      if (likes.has(track.id)) s += 0.05;
      if (recent.has(track.id)) s *= 0.35;
      // Mode style / radio : léger malus même artiste pour pousser la découverte
      if (
        (mode === 'style' || mode === 'radio' || mode === 'discover') &&
        seed &&
        artistKey(track) &&
        artistKey(track) === artistKey(seed)
      ) {
        s *= 0.82;
      }
      return { track, score: s };
    });

  const seedA = seed ? artistKey(seed) : '';
  const recentArtists = seedA ? [seedA] : [];
  return rerank(scored, recentArtists, {
    window: mode === 'style' || mode === 'discover' ? 6 : 5,
    seedArtist: seedA,
  });
}

export async function similarForUser(userId: string, trackId: string, seedTrack?: Track) {
  let seed =
    seedTrack ||
    ({ id: trackId, title: '', artists: [], thumbnails: [], type: 'song' } as Track);
  if (!seed.title) {
    try {
      const meta = await getTrack(trackId, { light: true });
      if (meta?.track?.title) seed = meta.track;
    } catch {
      /* ignore */
    }
  }
  const { related, radio } = await getRelated(trackId);
  let pool = [...radio, ...related];

  // Goûts biblio : injecter des titres aimés / playlists proches du seed
  const taste = getLibraryTasteTracks(userId, 120);
  const fromLibrary = pickLibraryNearSeed(seed, taste, 20);
  if (fromLibrary.length) pool = [...pool, ...fromLibrary];

  // Élargit hors upNext YouTube : search « même vibe » pour plus d’artistes
  try {
    if (seed.title || seed.artists?.length) {
      const q = styleSearchQuery(seed);
      const res = await search(q, 'song');
      const extra = [...(res.songs || []), ...(res.videos || [])].filter(
        (t) => t?.id && t.id !== trackId,
      );
      pool = [...pool, ...extra.slice(0, 24)];
    }
  } catch {
    /* ignore */
  }

  // Search ciblée sur 1–2 artistes de la biblio alignés sur le style du seed
  try {
    const artists = pickTasteArtists(seed, taste, 2);
    const tags = styleTags(seed).slice(0, 1);
    for (const name of artists) {
      const q = `${name} ${tags[0] || 'songs'}`.trim();
      const res = await search(q, 'song');
      const extra = [...(res.songs || []), ...(res.videos || [])].filter(
        (t) => t?.id && t.id !== trackId,
      );
      pool = [...pool, ...extra.slice(0, 10)];
    }
  } catch {
    /* ignore */
  }

  const ranked = await hybridRank({
    userId,
    candidates: pool,
    seed,
    mode: 'style',
  });
  return { tracks: ranked, related, radio };
}

export async function radioForUser(
  userId: string,
  categoryId: string,
  opts?: { light?: boolean },
) {
  const light = opts?.light === true;
  const cat = RADIO_CATEGORIES.find((c) => c.id === categoryId) || RADIO_CATEGORIES[0];
  let seedTrack: Track | null = null;
  let candidates: Track[] = [];

  if (cat.id === 'liked-radio') {
    const top = getTopListened(userId, light ? 12 : 15);
    seedTrack = top[0] || null;
    if (seedTrack && !light) {
      const { radio, related } = await getRelated(seedTrack.id);
      candidates = [...radio, ...related, ...top];
    } else {
      candidates = [...top];
    }
  }

  if (!candidates.length) {
    const q =
      cat.query ||
      getPrefs(userId).genres[0] ||
      'pop hits playlist';
    const res = await search(q, 'song');
    candidates = [...(res.songs || []), ...(res.videos || [])];
    seedTrack = candidates[0] || null;
    // Mode preview (Explorer) : pas de getRelated — 1 search suffit
    if (seedTrack && !light) {
      try {
        const { radio, related } = await getRelated(seedTrack.id);
        candidates = [...candidates, ...radio, ...related];
      } catch {
        /* ignore */
      }
    }
  }

  const tracks = await hybridRank({
    userId,
    candidates,
    seed: seedTrack,
    mode: cat.mode === 'radio' ? 'style' : cat.mode,
  });
  return {
    category: cat,
    tracks: tracks.slice(0, light ? 12 : 40),
    seed: seedTrack,
  };
}

export async function homeReco(userId: string) {
  const prefs = getPrefs(userId);
  const pins = listPins(userId);
  const history = getHistory(userId, 30);
  const top = getTopListened(userId, 20);
  const follows = listFollows(userId);
  const searches = listSearchHistory(userId, 10);

  const shelves: { title: string; items: Track[] }[] = [];

  if (pins.length) {
    shelves.push({
      title: 'Épinglé',
      items: pins.map((p) => {
        const payload = (p.payload || {}) as Track & { name?: string };
        const title = String(payload.title || payload.name || '').trim();
        return {
          ...payload,
          id: payload.id || p.targetId,
          title: title || p.targetId,
          artists: Array.isArray(payload.artists) ? payload.artists : [],
          thumbnails: Array.isArray(payload.thumbnails) ? payload.thumbnails : [],
          type: (payload.type || p.kind) as Track['type'],
        };
      }),
    });
  }

  if (history.length) {
    shelves.push({ title: 'Écouté récemment', items: history.slice(0, 20) });
  }

  const recentPlaylists = getEntityHistory(userId, 12, 'playlist');
  const recentAlbums = getEntityHistory(userId, 8, 'album');
  const recentMixes = getEntityHistory(userId, 8, 'mix');
  const recentCollections = [...recentPlaylists, ...recentAlbums, ...recentMixes]
    .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
    .slice(0, 16);
  if (recentCollections.length) {
    shelves.push({
      title: 'Playlists & albums récents',
      items: recentCollections as Track[],
    });
  }

  // YTM « Favoris à redécouvrir » / Forgotten favorites
  const forgotten = getForgottenFavorites(userId, 8);
  if (forgotten.length >= 2) {
    shelves.push({ title: 'Favoris à redécouvrir', items: forgotten });
  }

  if (top.length >= 3) {
    shelves.push({ title: 'Tes plus écoutés', items: top.slice(0, 20) });
  }

  // Shelves YT en parallèle (évite ~15 search séquentiels → cold start ~6s)
  type ExtraShelf = { title: string; items: Track[]; order: number };
  const extras: ExtraShelf[] = [];
  let order = 0;

  const jobs: Promise<void>[] = [];

  for (const g of prefs.genres.slice(0, 3)) {
    const slot = order++;
    jobs.push(
      (async () => {
        try {
          const res = await search(`${g} mix`, 'song');
          const items = await hybridRank({
            userId,
            candidates: [...(res.songs || []), ...(res.videos || [])],
            mode: 'radio',
          });
          if (items.length) extras.push({ title: `Pour toi · ${g}`, items: items.slice(0, 16), order: slot });
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  for (const f of follows.slice(0, 3)) {
    const slot = order++;
    const name = f.artist_name || f.artist_id;
    jobs.push(
      (async () => {
        try {
          const res = await search(name, 'song');
          const items = [...(res.songs || [])].slice(0, 16);
          if (items.length) extras.push({ title: `Abonnement · ${name}`, items, order: slot });
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  for (const h of searches.slice(0, 2)) {
    const q = String(h.query || '').trim();
    if (!q || q.length < 2) continue;
    const slot = order++;
    jobs.push(
      (async () => {
        try {
          const res = await search(q, 'song');
          const items = await hybridRank({
            userId,
            candidates: [...(res.songs || [])],
            mode: 'discover',
          });
          if (items.length) {
            extras.push({ title: `D’après ta recherche « ${q} »`, items: items.slice(0, 12), order: slot });
          }
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  for (const m of prefs.moods.slice(0, 2)) {
    const slot = order++;
    jobs.push(
      (async () => {
        try {
          const res = await search(`${m} playlist`, 'playlist');
          const items = [...(res.playlists || [])].slice(0, 12);
          if (items.length) extras.push({ title: `Ambiance · ${m}`, items, order: slot });
        } catch {
          /* ignore */
        }
      })(),
    );
  }

  await Promise.all(jobs);
  extras.sort((a, b) => a.order - b.order);
  for (const s of extras) shelves.push({ title: s.title, items: s.items });

  return {
    shelves,
    needsOnboarding: !prefs.onboardingDone,
    prefs,
    radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
  };
}

/** Métadonnées Explorer (rapide). Les rayons radio se chargent ensuite via radioForUser({ light }). */
export async function exploreReco(userId: string) {
  return {
    radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title, items: [] as Track[] })),
    needsOnboarding: !getPrefs(userId).onboardingDone,
  };
}

export function suggestSearch(userId: string, q: string, ytSuggestions: string[]) {
  const ql = q.trim().toLowerCase();
  const hist = listSearchHistory(userId, 30).map((h) => String(h.query || '').trim()).filter(Boolean);
  const prefs = getPrefs(userId);
  const boost = [...prefs.genres, ...prefs.moods];

  const histMatch = (h: string) => {
    if (!ql) return true; // focus vide → récentes
    const hl = h.toLowerCase();
    // Évite « a » / « e » qui matchent « Keny Arkana »
    if (ql.length < 2) return false;
    return hl.startsWith(ql) || hl.includes(` ${ql}`) || (ql.length >= 4 && hl.includes(ql));
  };

  // YouTube d’abord dès qu’on tape : l’historique ne doit plus écraser la requête courante
  const merged = ql
    ? [
        ...ytSuggestions,
        ...hist.filter(histMatch),
        ...boost.filter((b) => b.toLowerCase().includes(ql)),
      ]
    : [...hist.slice(0, 8), ...ytSuggestions, ...boost];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of merged) {
    const k = String(s || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(s).trim());
    if (out.length >= 12) break;
  }
  return out;
}
