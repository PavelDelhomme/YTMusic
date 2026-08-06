import type { Track } from './types.js';
import { getRelated, getTrack, getUpNext, search, getAlbum, getArtist, hydrateTracks } from './yt.js';
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
import { upsertTrack } from './db.js';
import { isWeakTitle } from './mappers.js';

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
  { re: /\brap\b|hip.?hop|drill|trap\b|rap fran[cç]ais|slam/, tag: 'hiphop' },
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
  { re: /comedy|comedian|stand.?up|sketch|parody|musical comedy|cabaret/, tag: 'comedy' },
  { re: /spoken.?word|poetry slam|slam poetry/, tag: 'spoken' },
  { re: /chanson|variété fran[cç]aise/, tag: 'chanson' },
  { re: /soundtrack|ost\b|score|film music/, tag: 'soundtrack' },
];

/** Artistes connus → tags (quand le titre seul ne suffit pas). */
const ARTIST_STYLE_HINTS: { re: RegExp; tags: string[] }[] = [
  { re: /bo burnham|tim minchin|flight of the conchords|weird al|axis of awesome|garfunkel and oates/, tags: ['comedy'] },
  { re: /keny arkana|m[ée]dine|iam\b|oxmo|nekfeu|orelsan|damso|pnl\b|sch\b|jul\b|niska|booba/, tags: ['hiphop'] },
  { re: /mozart|beethoven|bach\b|chopin|debussy/, tags: ['classical'] },
  { re: /miles davis|john coltrane|herbie hancock|ella fitzgerald/, tags: ['jazz'] },
];

function trackBlob(t: Track) {
  return `${t.title} ${(t.artists || []).map((a) => a.name).join(' ')} ${t.album?.name || ''}`.toLowerCase();
}

function energyProxy(t: Track): number {
  const blob = trackBlob(t);
  let e = 0.5;
  if (/chill|lofi|lo-fi|acoustic|piano|sleep|calm|jazz|ambient|bossa|comedy|spoken/.test(blob)) e -= 0.25;
  if (/workout|party|dance|edm|metal|rock|rap|drill|hard|trap|techno/.test(blob)) e += 0.25;
  return Math.max(0, Math.min(1, e));
}

function styleTags(t: Track): string[] {
  const blob = trackBlob(t);
  const tags = STYLE_TAGS.filter((x) => x.re.test(blob)).map((x) => x.tag);
  const artistBlob = (t.artists || []).map((a) => a.name).join(' ').toLowerCase();
  for (const hint of ARTIST_STYLE_HINTS) {
    if (hint.re.test(artistBlob) || hint.re.test(blob)) tags.push(...hint.tags);
  }
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
  if (artist && cleanTitle) return `${artist} ${cleanTitle} similar songs`;
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
      else if (seedTags.length && candTags.length) {
        // Tags incompatibles (comedy vs hiphop) → malus fort
        s -= 0.18;
      } else {
        // Pas de tag explicite : faible proxy énergie (évite dump biblio plat)
        const d = Math.abs(energyProxy(candidate) - energyProxy(seed));
        s += Math.max(0, 0.08 - d * 0.3);
      }
    }
  // Réduit le poids du title-overlap brut (poussait les covers « même titre »)
  const titleOverlap = seed.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && candidate.title.toLowerCase().includes(w)).length;
  if (titleOverlap && artistKey(candidate) === artistKey(seed)) {
    s += Math.min(0.1, titleOverlap * 0.03);
  } else if (titleOverlap) {
    s += Math.min(0.04, titleOverlap * 0.015);
  }
  }
  const blob = trackBlob(candidate);
  for (const g of prefsGenres) {
    if (g && blob.includes(g.toLowerCase())) s += 0.1;
  }
  return Math.max(0, Math.min(1, s));
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
  // Completé récemment = déjà entendu : ne pas booster (évite de remettre les « déjà joués »)
  if (completes.has(trackId)) return 0.32;
  return 0.5;
}

/** Proximité seed ↔ titre biblio (réutilise scoreContent sans prefs). */
function proximityToSeed(candidate: Track, seed: Track) {
  return scoreContent(candidate, seed, []);
}

/** Couverture / remix spam du titre seed (surtout radio album). */
function isRemixSpamOfSeed(candidate: Track, seed: Track): boolean {
  const seedCore = cleanCoreTitle(seed.title);
  const candCore = cleanCoreTitle(candidate.title);
  if (seedCore.length < 5 || candCore.length < 5) return false;
  const sameArtist =
    Boolean(artistKey(candidate)) && artistKey(candidate) === artistKey(seed);
  if (sameArtist) return false;
  const shares =
    candCore.includes(seedCore) ||
    seedCore.includes(candCore) ||
    (seedCore.length >= 8 && candidate.title.toLowerCase().includes(seedCore));
  if (!shares) return false;
  if (
    /\b(remix|cover|8-?bit|chiptune|karaoke|instrumental|sega|game version|computer game|tribute|nightcore|slowed)\b/i.test(
      candidate.title,
    )
  ) {
    return true;
  }
  // Même titre (hors seed artist) = quasi toujours cover
  if (candCore === seedCore) return true;
  return false;
}

function cleanCoreTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics|hd|4k|remaster(?:ed)?|live|feat\.?|ft\.?|radio edit|remix)\b/gi, ' ')
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Titres de la biblio proches du seed (même vibe / artiste — pas un dump likes). */
function pickLibraryNearSeed(seed: Track, library: Track[], max: number): Track[] {
  const seedTags = styleTags(seed);
  const seedA = artistKey(seed);
  const scored: { t: Track; s: number }[] = [];
  for (const t of library) {
    if (!t?.id || t.id === seed.id) continue;
    const sameArtist = Boolean(seedA) && artistKey(t) === seedA;
    const candTags = styleTags(t);
    const overlap = seedTags.filter((tag) => candTags.includes(tag)).length;
    const s = proximityToSeed(t, seed);

    if (seedTags.length) {
      // Seed typé : même artiste OU overlap de tags obligatoire
      if (!sameArtist && overlap === 0) continue;
      if (s < 0.38) continue;
    } else if (sameArtist) {
      if (s < 0.3) continue;
    } else {
      // Seed sans tags + autre artiste : refuser (énergie seule ≠ similarité)
      continue;
    }
    scored.push({ t, s });
  }
  const cap = seedTags.length ? max : Math.min(max, 3);
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, cap)
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
    let s = 0.1;
    if (seedTags.length) {
      const overlap = seedTags.filter((tag) => styleTags(t).includes(tag)).length;
      if (!overlap) continue;
      s += overlap * 0.3;
    } else {
      // Sans tags seed : ne pas élargir via biblio (trop bruité)
      continue;
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
  opts?: { window?: number; seedArtist?: string; seedArtistEvery?: number },
) {
  const window = opts?.window ?? 5;
  const seedArtist = opts?.seedArtist || '';
  const every = Math.max(2, opts?.seedArtistEvery ?? 4);
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
      // Cap : pas plus d’1 titre sur N du seed artist (variété)
      if (
        seedArtist &&
        a === seedArtist &&
        seedArtistHits >= Math.max(1, Math.floor(out.length / every) + 1)
      ) {
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
  // Déjà assez écoutés (24h) / historique récent → exclus de la radio / À suivre
  const recentlyPlayedHard = new Set<string>();
  for (const e of events) {
    if (Date.now() - e.created_at > 24 * 3600 * 1000) continue;
    if (e.event === 'complete' || e.event === 'start' || e.event === 'skip') {
      recentlyPlayedHard.add(e.track_id);
    }
  }
  try {
    for (const t of getHistory(opts.userId, 50)) {
      if (t?.id) recentlyPlayedHard.add(t.id);
    }
  } catch {
    /* ignore */
  }

  const seed = opts.seed || null;
  const seedTags = seed ? styleTags(seed) : [];
  // Mode style / radio / album : prioriser la proximité seed (pas les likes hors registre)
  const baseW = getWeights(mode);
  const w =
    mode === 'style' || mode === 'album-style' || mode === 'radio'
      ? {
          ...baseW,
          w_content: Math.max(baseW.w_content, 0.42),
          w_bandit: Math.min(baseW.w_bandit, 0.12),
          w_satisf: Math.min(baseW.w_satisf, 0.08),
        }
      : baseW;

  const excludePlayed =
    mode === 'style' || mode === 'radio' || mode === 'album-style' || mode === 'artist-radio';

  const scored = opts.candidates
    .filter((t) => t?.id && /^[a-zA-Z0-9_-]{11}$/.test(t.id))
    .filter((t) => !seed || t.id !== seed.id)
    .filter((t) => !seed || !isRemixSpamOfSeed(t, seed))
    .filter((t) => !(excludePlayed && recentlyPlayedHard.has(t.id)))
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
      const a = artistKey(track);
      const candTags = styleTags(track);
      const tagOverlap = seedTags.filter((tag) => candTags.includes(tag)).length;
      // Affinité biblio seulement si alignée au seed (sinon Keny Arkana sur comedy)
      if (a && tasteArtists.has(a)) {
        if (!seedTags.length || tagOverlap || (seed && a === artistKey(seed))) s += 0.07;
        else s -= 0.05;
      }
      if (likes.has(track.id)) {
        if (!seedTags.length || tagOverlap || (seed && a === artistKey(seed))) s += 0.05;
        else s -= 0.04;
      }
      if (seedTags.length && candTags.length && tagOverlap === 0 && a !== artistKey(seed!)) {
        s *= 0.55;
      }
      // Album-style : boost artiste(s) de l’album seed
      if (
        mode === 'album-style' &&
        seed &&
        a &&
        (seed.artists || []).some(
          (sa) => (sa.id || sa.name || '').toLowerCase() === a,
        )
      ) {
        s += 0.06;
      }
      if (recent.has(track.id)) s *= 0.35;
      // Mode style / radio : léger malus même artiste pour pousser la découverte
      // artist-radio : on garde plus le seed artiste ; album-style : entre les deux
      if (
        seed &&
        artistKey(track) &&
        artistKey(track) === artistKey(seed)
      ) {
        if (mode === 'artist-radio') s *= 0.95;
        else if (mode === 'album-style') s *= 0.88;
        else if (mode === 'style' || mode === 'radio' || mode === 'discover') s *= 0.82;
      }
      return { track, score: s };
    });

  const seedA = seed ? artistKey(seed) : '';
  const recentArtists = seedA ? [seedA] : [];
  const artistCapWindow =
    mode === 'artist-radio' ? 4 : mode === 'style' || mode === 'discover' || mode === 'album-style' ? 6 : 5;
  return rerank(scored, recentArtists, {
    window: artistCapWindow,
    seedArtist: seedA,
    seedArtistEvery: mode === 'artist-radio' ? 3 : 4,
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

/**
 * Suite « À suivre » rapide : upNext YT seulement (+ biblio légère), sans getRelated/search/rank.
 * Pour pouvoir skip dès le play (le full similarForUser enrichit ensuite).
 */
export async function similarForUserFast(userId: string, trackId: string, seedTrack?: Track) {
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
  // Hydrate léger (10) pour répondre vite — le full related enrichit ensuite
  const up = await getUpNext(trackId, { hydrateLimit: 10 });
  // Fast path : upNext seedé — exclure l’historique récent (pas de « déjà joués »)
  let histIds = new Set<string>();
  try {
    histIds = new Set(getHistory(userId, 50).map((t) => t.id).filter(Boolean));
  } catch {
    histIds = new Set();
  }
  const tracks = dedupeTracks(
    up.filter((t) => t.id !== trackId && !histIds.has(t.id)),
  ).slice(0, 40);
  return { tracks, related: [] as Track[], radio: tracks };
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (!t?.id || seen.has(t.id)) continue;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

async function expandWithTasteAndSearch(opts: {
  userId: string;
  seed: Track;
  pool: Track[];
  excludeId?: string;
  searchQueries?: string[];
  libraryMax?: number;
}) {
  let pool = [...opts.pool];
  const taste = getLibraryTasteTracks(opts.userId, 120);
  const fromLibrary = pickLibraryNearSeed(opts.seed, taste, opts.libraryMax ?? 18);
  if (fromLibrary.length) pool = [...pool, ...fromLibrary];

  const queries = opts.searchQueries?.filter(Boolean) || [];
  if (!queries.length && (opts.seed.title || opts.seed.artists?.length)) {
    queries.push(styleSearchQuery(opts.seed));
  }
  for (const q of queries.slice(0, 3)) {
    try {
      const res = await search(q, 'song');
      const extra = [...(res.songs || []), ...(res.videos || [])].filter(
        (t) => t?.id && t.id !== opts.excludeId,
      );
      pool = [...pool, ...extra.slice(0, 16)];
    } catch {
      /* ignore */
    }
  }

  try {
    const artists = pickTasteArtists(opts.seed, taste, 2);
    const tags = styleTags(opts.seed).slice(0, 1);
    for (const name of artists) {
      const q = `${name} ${tags[0] || 'songs'}`.trim();
      const res = await search(q, 'song');
      const extra = [...(res.songs || []), ...(res.videos || [])].filter(
        (t) => t?.id && t.id !== opts.excludeId,
      );
      pool = [...pool, ...extra.slice(0, 8)];
    }
  } catch {
    /* ignore */
  }

  return dedupeTracks(pool);
}

/**
 * Radio / similaires album : vibe de l’album (pas juste le 1er titre),
 * + related/radio YT, + goûts biblio, + search « songs like ».
 */
export async function albumSimilarForUser(userId: string, albumId: string) {
  const { album, tracks } = await getAlbum(albumId);
  const playable = tracks.filter((t) => t?.id && /^[a-zA-Z0-9_-]{11}$/.test(t.id));
  // Évite d’ancrer uniquement sur la piste 1 (related YT = souvent covers de ce titre)
  let seed = playable[Math.min(1, Math.max(0, playable.length - 1))] || playable[0] || null;
  if (!seed) return { tracks: [] as Track[], seed: null, album };

  if ((!seed.artists || !seed.artists.length) && album.artists?.length) {
    seed = { ...seed, artists: album.artists };
  }

  const { related, radio } = await getRelated(seed.id);
  // Amorçage : pistes album (hors seed) + related/radio — filtre covers du seed
  let pool: Track[] = [
    ...playable.filter((t) => t.id !== seed!.id).slice(0, 12),
    ...radio,
    ...related,
  ].filter((t) => !isRemixSpamOfSeed(t, seed!));

  // 2ᵉ ancre différente pour élargir la vibe album
  const mid = playable[Math.min(4, Math.max(0, playable.length - 1))];
  if (mid && mid.id !== seed.id) {
    try {
      const r2 = await getRelated(mid.id);
      pool = [
        ...pool,
        ...[...r2.radio.slice(0, 14), ...r2.related.slice(0, 10)].filter(
          (t) => !isRemixSpamOfSeed(t, seed!) && !isRemixSpamOfSeed(t, mid),
        ),
      ];
    } catch {
      /* ignore */
    }
  }

  const artistName = album.artists?.[0]?.name || seed.artists?.[0]?.name || '';
  const albumTitle = String(album.title || '').trim();
  const tags = styleTags(seed);
  const queries = [
    artistName && tags.length ? `${artistName} ${tags.slice(0, 2).join(' ')} songs` : '',
    artistName && albumTitle ? `${artistName} ${albumTitle} era playlist` : '',
    artistName ? `${artistName} similar artists mix` : '',
    styleSearchQuery(seed),
  ].filter(Boolean);

  pool = await expandWithTasteAndSearch({
    userId,
    seed,
    pool,
    excludeId: seed.id,
    searchQueries: queries,
    libraryMax: 22,
  });

  const ranked = await hybridRank({
    userId,
    candidates: pool,
    seed,
    mode: 'album-style',
  });
  return { tracks: ranked, seed, album, related, radio };
}

/**
 * Radio / similaires artiste : tops + related + artistes similaires + biblio.
 */
export async function artistSimilarForUser(userId: string, artistId: string) {
  const { artist, songs, similar } = await getArtist(artistId);
  const playable = songs.filter((t) => t?.id && /^[a-zA-Z0-9_-]{11}$/.test(t.id));
  let seed = playable[0] || null;
  if (!seed) return { tracks: [] as Track[], seed: null, artist };

  if (!seed.artists?.length) {
    seed = {
      ...seed,
      artists: [{ name: artist.name || 'Artiste', id: artistId }],
    };
  }

  const { related, radio } = await getRelated(seed.id);
  let pool: Track[] = [...radio, ...related, ...playable.slice(0, 14)];

  // Artistes similaires YTM → quelques titres via search
  const simArtists = (similar || [])
    .map((s) => String(s.title || s.artists?.[0]?.name || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  for (const name of simArtists) {
    try {
      const res = await search(`${name} popular songs`, 'song');
      pool = [...pool, ...(res.songs || []).slice(0, 8)];
    } catch {
      /* ignore */
    }
  }

  const queries = [
    `${artist.name || ''} similar artists mix`.trim(),
    styleSearchQuery(seed),
  ].filter(Boolean);

  pool = await expandWithTasteAndSearch({
    userId,
    seed,
    pool,
    excludeId: seed.id,
    searchQueries: queries,
    libraryMax: 20,
  });

  const ranked = await hybridRank({
    userId,
    candidates: pool,
    seed,
    mode: 'artist-radio',
  });
  return { tracks: ranked, seed, artist, related, radio };
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
  let history = getHistory(userId, 30);
  const top = getTopListened(userId, 20);
  const follows = listFollows(userId);
  const searches = listSearchHistory(userId, 10);

  // Cache history parfois figé « Sans titre » alors que getTrack hydrate OK.
  const weakHist = history.filter(
    (t) => isWeakTitle(t.title, t.id) || !(t.artists || []).length,
  );
  if (weakHist.length) {
    try {
      const fixed = await hydrateTracks(weakHist, { limit: 24, concurrency: 4 });
      const byId = new Map(fixed.map((t) => [t.id, t]));
      history = history.map((t) => byId.get(t.id) || t);
      for (const t of fixed) {
        if (!isWeakTitle(t.title, t.id)) upsertTrack(t);
      }
    } catch (err) {
      console.warn('[home] hydrate history', (err as Error).message);
    }
  }

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

  // Focus vide → UNIQUEMENT l’historique (pas de suggestions YouTube / boost)
  if (!ql) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of hist) {
      const k = h.toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(h);
      if (out.length >= 12) break;
    }
    return out;
  }

  // YouTube d’abord dès qu’on tape : l’historique ne doit plus écraser la requête courante
  const merged = [
    ...ytSuggestions,
    ...hist.filter(histMatch),
    ...boost.filter((b) => b.toLowerCase().includes(ql)),
  ];

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
