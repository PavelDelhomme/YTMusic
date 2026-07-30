import type { Track } from './types.js';

/** Normalise pour comparaison : minuscules, sans accents, ponctuation allégée. */
export function foldText(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  return foldText(s)
    .split(' ')
    .filter((t) => t.length > 0);
}

function includesWord(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (hay === needle) return true;
  return ` ${hay} `.includes(` ${needle} `);
}

/** Préfixe de mot entier : « poto » matche « poto remix », pas « potomac ». */
function startsWithWord(hay: string, needle: string): boolean {
  if (!needle || !hay.startsWith(needle)) return false;
  if (hay.length === needle.length) return true;
  return hay[needle.length] === ' ';
}

function tokenCoverage(hayTokens: Set<string>, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  let hit = 0;
  for (const t of queryTokens) {
    if (hayTokens.has(t)) hit += 1;
    else if ([...hayTokens].some((h) => h === t || (t.length >= 3 && (h.startsWith(t) || t.startsWith(h)))))
      hit += 0.45;
  }
  return hit / queryTokens.length;
}

/**
 * Score de pertinence d’un résultat vs la requête utilisateur.
 * Plus le score est haut, plus le résultat doit remonter.
 */
export function scoreSearchItem(track: Track, query: string): number {
  const q = foldText(query);
  if (!q) return 0;
  const qTokens = tokenize(query);
  const title = foldText(track.title);
  const artistNames = (track.artists || []).map((a) => a.name).filter(Boolean);
  const artists = foldText(artistNames.join(' '));
  const album = foldText(track.album?.name || '');
  const titleTokens = new Set(tokenize(track.title));
  const artistTokens = new Set(tokenize(artists));
  const allTokens = new Set([...titleTokens, ...artistTokens, ...tokenize(album)]);
  const type = track.type || 'unknown';

  let score = 0;

  // —— Titre ——
  if (title === q) score += 1200;
  else if (startsWithWord(title, q)) score += 820;
  else if (includesWord(title, q)) score += 640;
  else if (q.length >= 4 && title.includes(q)) score += 280;

  // Tous les tokens de la query dans le titre
  if (qTokens.length > 1 && qTokens.every((t) => titleTokens.has(t) || includesWord(title, t))) score += 420;
  score += tokenCoverage(titleTokens, qTokens) * 280;

  // —— Artiste ——
  // Ne pas matcher des fragments dans des pseudos (@poto_…) : mots entiers seulement
  if (artists === q) score += 1100;
  else if (artistNames.some((n) => foldText(n) === q)) score += 1050;
  else if (startsWithWord(artists, q) || includesWord(artists, q)) score += 700;
  score += tokenCoverage(artistTokens, qTokens) * (type === 'artist' ? 120 : 220);

  // —— Titre + artiste (ex. "Poto Demi Portion" ou "Demi Portion Poto") ——
  if (qTokens.length >= 2) {
    for (let i = 1; i < qTokens.length; i++) {
      const left = qTokens.slice(0, i).join(' ');
      const right = qTokens.slice(i).join(' ');
      const titleLeft =
        title === left || startsWithWord(title, left) || includesWord(title, left);
      const titleRight =
        title === right || startsWithWord(title, right) || includesWord(title, right);
      const artistLeft =
        artists.includes(left) || artistNames.some((n) => foldText(n).includes(left));
      const artistRight =
        artists.includes(right) || artistNames.some((n) => foldText(n).includes(right));
      if (titleLeft && artistRight) score += 950;
      if (titleRight && artistLeft) score += 920;
    }
  }

  // —— Album ——
  if (album && (album === q || includesWord(album, q) || (q.length >= 4 && album.includes(q)))) {
    score += 180;
  }

  // Couverture globale des tokens
  score += tokenCoverage(allTokens, qTokens) * 160;

  // Bonus type selon l’intention probable
  if (type === 'song') score += 50;
  else if (type === 'artist') {
    if (artists === q || title === q) score += 80;
    else score += 10;
  } else if (type === 'album') score += 20;
  else if (type === 'video') score -= 40;
  else if (type === 'playlist') score -= 50;

  // Titre court exact (ex. « Poto »)
  if (qTokens.length === 1 && title === q && (type === 'song' || type === 'video' || type === 'unknown')) {
    score += 280;
    if (type === 'song') score += 40;
  }

  return score;
}

export function rankByQuery<T extends Track>(
  items: T[],
  query: string,
  personalization?: SearchPersonalization,
): T[] {
  if (!items.length) return items;
  return items
    .map((item, index) => {
      const relevance = scoreSearchItem(item, query);
      return {
        item,
        index,
        relevance,
        score: relevance + personalizeBoost(item, personalization, query),
      };
    })
    // Écarte le bruit perso sans match lexical (reste disponible plus bas si vraiment vide)
    .sort((a, b) => b.score - a.score || b.relevance - a.relevance || a.index - b.index)
    .map((x) => x.item);
}

export type SearchPersonalization = {
  /** Noms d’artistes (déjà foldés) à booster */
  artistNames: string[];
  trackIds: string[];
};

/**
 * Soft personalization: never override lexical relevance.
 * Boost only when the track already matches the query reasonably.
 */
export function personalizeBoost(
  track: Track,
  p?: SearchPersonalization,
  query?: string,
): number {
  if (!p) return 0;
  const relevance = query ? scoreSearchItem(track, query) : 0;
  // Hors-sujet (ex. favori Keny Arkana sur « tenebro rossi ») → 0
  if (query && relevance < 180) return 0;

  let boost = 0;
  const artists = foldText((track.artists || []).map((a) => a.name).join(' '));
  const title = foldText(track.title);
  const qFold = query ? foldText(query) : '';

  for (const name of p.artistNames) {
    if (!name || name.length < 2) continue;
    const mentionedInQuery = Boolean(qFold) && (qFold.includes(name) || name.includes(qFold));
    if (artists === name || includesWord(artists, name)) {
      boost += mentionedInQuery ? 90 : 45;
    } else if (artists.includes(name) && name.length >= 4) {
      boost += mentionedInQuery ? 50 : 20;
    }
    if (title.includes(name) && track.type === 'artist') boost += 30;
  }
  if (p.trackIds.includes(track.id) && relevance >= 220) boost += 40;

  const cap = Math.max(40, Math.floor(relevance * 0.15));
  return Math.min(boost, cap);
}

function uniqById(arr: Track[]): Track[] {
  const seen = new Set<string>();
  return arr.filter((t) => {
    if (!t?.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/** Qualité d’une fiche artiste pour départager les doublons. */
function artistQuality(a: Track, query?: string): number {
  let q = 0;
  const id = String(a.id || '');
  if (id.startsWith('UC')) q += 80; // channel YouTube canonique
  else if (id.startsWith('MP')) q += 40;
  if (a.type === 'artist') q += 30;
  const thumbs = a.thumbnails?.length || 0;
  q += Math.min(20, thumbs * 4);
  const bestThumb = Math.max(0, ...(a.thumbnails || []).map((t) => t.width || 0));
  q += Math.min(25, Math.floor(bestThumb / 40));
  if (query) q += Math.min(200, scoreSearchItem(a, query));
  return q;
}

/**
 * Déduplique une liste d’artistes : même id OU même nom (foldé).
 * Garde la meilleure fiche (UC id, thumbs, score vs requête).
 */
export function dedupeArtists(items: Track[], query?: string): Track[] {
  type Slot = { track: Track; name: string };
  const slots: Slot[] = [];

  for (const raw of items) {
    if (!raw?.id) continue;
    const name = foldText(raw.title || raw.artists?.[0]?.name || '');
    const idx = slots.findIndex(
      (s) => s.track.id === raw.id || (name.length >= 2 && s.name === name),
    );
    if (idx < 0) {
      slots.push({ track: raw, name });
      continue;
    }
    if (artistQuality(raw, query) > artistQuality(slots[idx].track, query)) {
      slots[idx] = { track: raw, name: name || slots[idx].name };
    }
  }

  return slots.map((s) => s.track);
}

export function mergeTracks(...lists: Track[][]): Track[] {
  return uniqById(lists.flat());
}

/** Choisit le meilleur « top result » parmi les buckets déjà rankés. */
export function pickTopResult(
  query: string,
  buckets: {
    topResult?: Track | null;
    songs: Track[];
    artists: Track[];
    albums: Track[];
    videos: Track[];
    playlists: Track[];
  },
  personalization?: SearchPersonalization,
): Track | null {
  const candidates: Track[] = [];
  if (buckets.topResult) candidates.push(buckets.topResult);
  candidates.push(...buckets.songs.slice(0, 8));
  candidates.push(...buckets.artists.slice(0, 4));
  candidates.push(...buckets.albums.slice(0, 3));
  candidates.push(...buckets.videos.slice(0, 3));

  if (!candidates.length) return null;

  const q = foldText(query);
  const exactSongs = buckets.songs.filter((t) => foldText(t.title) === q);
  // Requête courte = intention « titre » : le morceau exact gagne toujours le top
  if (tokenize(query).length <= 2 && exactSongs.length >= 1) {
    return rankByQuery(exactSongs, query, personalization)[0] || null;
  }

  const ranked = rankByQuery(uniqById(candidates), query, personalization);
  const best = ranked[0];
  if (!best) return buckets.topResult || null;
  const bestRel = scoreSearchItem(best, query);
  const bestScore = bestRel + personalizeBoost(best, personalization, query);

  // Top YT n’est accepté que s’il matche aussi lexicalement la requête
  if (buckets.topResult) {
    const ytRel = scoreSearchItem(buckets.topResult, query);
    const ytScore = ytRel + personalizeBoost(buckets.topResult, personalization, query);
    if (ytRel < 180) {
      return bestRel >= 180 ? best : buckets.topResult;
    }
    if (bestScore >= ytScore + 40) return best;
    if (ytRel >= 400) return buckets.topResult;
  }

  return bestRel >= 180 ? best : buckets.topResult || best;
}

/** Libellés de shelf Innertube (EN + FR) → bucket. */
export function shelfBucketFromTitle(title: string): 'songs' | 'videos' | 'albums' | 'artists' | 'playlists' | null {
  const t = foldText(title);
  if (!t) return null;
  if (/\b(song|songs|titre|titres|morceau|morceaux|track|tracks)\b/.test(t)) return 'songs';
  if (/\b(video|videos|video|videos)\b/.test(t) || t.includes('video')) return 'videos';
  if (/\b(album|albums)\b/.test(t)) return 'albums';
  if (/\b(artist|artists|artiste|artistes)\b/.test(t)) return 'artists';
  if (/\b(playlist|playlists|communaut)\b/.test(t)) return 'playlists';
  return null;
}
