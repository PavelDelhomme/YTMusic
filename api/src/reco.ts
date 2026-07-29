import type { Track } from './types.js';
import { getRelated, search } from './yt.js';
import {
  getPrefs,
  getWeights,
  listFollows,
  listListenEvents,
  listPins,
  listSearchHistory,
} from './prefs.js';
import { getForgottenFavorites, getHistory, getTopListened } from './library.js';

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

function energyProxy(t: Track): number {
  const blob = `${t.title} ${(t.artists || []).map((a) => a.name).join(' ')}`.toLowerCase();
  let e = 0.5;
  if (/chill|lofi|lo-fi|acoustic|piano|sleep|calm|jazz|ambient/.test(blob)) e -= 0.25;
  if (/workout|party|dance|edm|metal|rock|rap|drill|hard/.test(blob)) e += 0.25;
  return Math.max(0, Math.min(1, e));
}

function artistKey(t: Track) {
  return (t.artists?.[0]?.id || t.artists?.[0]?.name || '').toLowerCase();
}

function scoreContent(candidate: Track, seed: Track | null, prefsGenres: string[]) {
  let s = 0.3;
  if (seed) {
    const sameArtist = artistKey(candidate) && artistKey(candidate) === artistKey(seed);
    if (sameArtist) s += 0.35;
    const titleOverlap = seed.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && candidate.title.toLowerCase().includes(w)).length;
    s += Math.min(0.2, titleOverlap * 0.05);
  }
  const blob = `${candidate.title}`.toLowerCase();
  for (const g of prefsGenres) {
    if (g && blob.includes(g.toLowerCase())) s += 0.08;
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

function scoreSatisf(trackId: string, skips: Set<string>, completes: Set<string>, likes: Set<string>) {
  if (skips.has(trackId)) return 0.15;
  if (likes.has(trackId)) return 0.95;
  if (completes.has(trackId)) return 0.8;
  return 0.5;
}

function rerank(scored: { track: Track; score: number }[], recentArtist: string[]) {
  const out: { track: Track; score: number }[] = [];
  const usedArtists: string[] = [...recentArtist];
  const pool = [...scored].sort((a, b) => b.score - a.score);
  while (pool.length && out.length < 40) {
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      const a = artistKey(pool[i].track);
      const recent = usedArtists.slice(-3);
      if (a && recent.includes(a)) continue;
      idx = i;
      break;
    }
    const pick = pool.splice(idx, 1)[0];
    out.push(pick);
    const a = artistKey(pick.track);
    if (a) usedArtists.push(a);
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
  const likes = new Set(getTopListened(opts.userId, 100).map((t) => t.id));

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
      if (recent.has(track.id)) s *= 0.35;
      return { track, score: s };
    });

  const recentArtists = (seed ? [artistKey(seed)] : []).filter(Boolean);
  return rerank(scored, recentArtists);
}

export async function similarForUser(userId: string, trackId: string, seedTrack?: Track) {
  const { related, radio } = await getRelated(trackId);
  const pool = [...radio, ...related];
  const ranked = await hybridRank({
    userId,
    candidates: pool,
    seed: seedTrack || ({ id: trackId, title: '', artists: [], thumbnails: [], type: 'song' } as Track),
    mode: 'radio',
  });
  return { tracks: ranked, related, radio };
}

export async function radioForUser(userId: string, categoryId: string) {
  const cat = RADIO_CATEGORIES.find((c) => c.id === categoryId) || RADIO_CATEGORIES[0];
  let seedTrack: Track | null = null;
  let candidates: Track[] = [];

  if (cat.id === 'liked-radio') {
    const top = getTopListened(userId, 15);
    seedTrack = top[0] || null;
    if (seedTrack) {
      const { radio, related } = await getRelated(seedTrack.id);
      candidates = [...radio, ...related, ...top];
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
    if (seedTrack) {
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
    mode: cat.mode,
  });
  return { category: cat, tracks: tracks.slice(0, 40), seed: seedTrack };
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
        const payload = p.payload as Track;
        return {
          ...payload,
          id: payload.id || p.targetId,
          type: (payload.type || p.kind) as Track['type'],
        };
      }),
    });
  }

  if (history.length) {
    shelves.push({ title: 'Écouté récemment', items: history.slice(0, 20) });
  }

  // YTM « Favoris à redécouvrir » / Forgotten favorites
  const forgotten = getForgottenFavorites(userId, 8);
  if (forgotten.length >= 2) {
    shelves.push({ title: 'Favoris à redécouvrir', items: forgotten });
  }

  if (top.length >= 3) {
    shelves.push({ title: 'Tes plus écoutés', items: top.slice(0, 20) });
  }

  // Prefs-driven shelves
  for (const g of prefs.genres.slice(0, 3)) {
    try {
      const res = await search(`${g} mix`, 'song');
      const items = await hybridRank({
        userId,
        candidates: [...(res.songs || []), ...(res.videos || [])],
        mode: 'radio',
      });
      if (items.length) shelves.push({ title: `Pour toi · ${g}`, items: items.slice(0, 16) });
    } catch {
      /* ignore */
    }
  }

  for (const f of follows.slice(0, 2)) {
    try {
      const res = await search(f.artist_name || f.artist_id, 'song');
      const items = [...(res.songs || [])].slice(0, 16);
      if (items.length) {
        shelves.push({ title: `Abonnement · ${f.artist_name || f.artist_id}`, items });
      }
    } catch {
      /* ignore */
    }
  }

  if (searches.length) {
    try {
      const q = searches[0].query;
      const res = await search(q, 'song');
      const items = await hybridRank({
        userId,
        candidates: [...(res.songs || [])],
        mode: 'discover',
      });
      if (items.length) shelves.push({ title: `D’après ta recherche « ${q} »`, items: items.slice(0, 12) });
    } catch {
      /* ignore */
    }
  }

  return {
    shelves,
    needsOnboarding: !prefs.onboardingDone,
    prefs,
    radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
  };
}

export async function exploreReco(userId: string) {
  const radios = [];
  for (const cat of RADIO_CATEGORIES.slice(0, 6)) {
    try {
      const r = await radioForUser(userId, cat.id);
      radios.push({
        id: cat.id,
        title: cat.title,
        items: r.tracks.slice(0, 12),
      });
    } catch {
      radios.push({ id: cat.id, title: cat.title, items: [] });
    }
  }
  return { radios, needsOnboarding: !getPrefs(userId).onboardingDone };
}

export function suggestSearch(userId: string, q: string, ytSuggestions: string[]) {
  const hist = listSearchHistory(userId, 20).map((h) => h.query as string);
  const prefs = getPrefs(userId);
  const boost = [...prefs.genres, ...prefs.moods];
  const merged = [
    ...hist.filter((h) => !q || h.toLowerCase().includes(q.toLowerCase())),
    ...boost.filter((b) => !q || b.toLowerCase().includes(q.toLowerCase())),
    ...ytSuggestions,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of merged) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}
