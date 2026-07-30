import { apiUrl } from '../api';

const WARM_CACHE = 'ytm-stream-warm-v1';
const FULL_CACHE = 'ytm-stream-full-v1';

/** Nombre max de pistes dont on garde le début en mémoire */
const MAX_HEAD = 48;
/** Taille du début préchargé (~768 Ko ≈ plusieurs secondes d’audio) */
const HEAD_BYTES = 768 * 1024;
/** Pistes complètes en Cache Storage (instant play) */
const MAX_FULL = 24;
/** Warm format API en parallèle */
const WARM_CONCURRENCY = 4;
/** Prefetch tête en parallèle */
const HEAD_CONCURRENCY = 3;
/** Prefetch full (lourd) en parallèle */
const FULL_CONCURRENCY = 2;

type HeadEntry = { buf: ArrayBuffer; at: number };

const headCache = new Map<string, HeadEntry>();
const warmDone = new Map<string, number>();
const inflightWarm = new Set<string>();
const inflightHead = new Set<string>();
const inflightFull = new Set<string>();
const blobUrls = new Map<string, string>();

let fullOrder: string[] = [];

function isVideoId(id: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function touchLru<K>(map: Map<K, unknown>, key: K, max: number) {
  if (!map.has(key)) return;
  const v = map.get(key)!;
  map.delete(key);
  map.set(key, v);
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const h: Record<string, string> = {};
  try {
    const t = localStorage.getItem('ytm_token') || sessionStorage.getItem('ytm_token');
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
}

/** Chauffe le déchiffrement googlevideo côté API (latence principale). */
export async function warmFormat(id: string): Promise<void> {
  if (!isVideoId(id)) return;
  const last = warmDone.get(id);
  if (last && Date.now() - last < 4 * 60_000) return;
  if (inflightWarm.has(id)) return;
  inflightWarm.add(id);
  try {
    const res = await fetch(apiUrl(`/api/stream/${id}/url`), {
      credentials: 'include',
      headers: await authHeaders(),
    });
    if (res.ok) warmDone.set(id, Date.now());
    if (warmDone.size > 80) {
      const first = warmDone.keys().next().value;
      if (first) warmDone.delete(first);
    }
  } catch {
    /* ignore */
  } finally {
    inflightWarm.delete(id);
  }
}

/** Batch warm format (1 requête HTTP). */
export async function warmFormats(ids: string[]): Promise<void> {
  const need = [...new Set(ids.filter(isVideoId))].filter((id) => {
    const last = warmDone.get(id);
    return !(last && Date.now() - last < 4 * 60_000);
  });
  if (!need.length) return;
  try {
    const res = await fetch(apiUrl('/api/stream/warm'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({ ids: need.slice(0, 32) }),
    });
    if (res.ok) {
      const now = Date.now();
      for (const id of need.slice(0, 32)) warmDone.set(id, now);
    } else {
      // fallback parallèle
      await runPool(need.slice(0, 12), WARM_CONCURRENCY, warmFormat);
    }
  } catch {
    await runPool(need.slice(0, 8), WARM_CONCURRENCY, warmFormat);
  }
}

/** Précharge le début du flux (Range) en RAM — démarrage quasi immédiat. */
export async function warmHead(id: string): Promise<void> {
  if (!isVideoId(id)) return;
  if (headCache.has(id)) {
    touchLru(headCache, id, MAX_HEAD);
    return;
  }
  if (inflightHead.has(id)) return;
  inflightHead.add(id);
  try {
    await warmFormat(id);
    const res = await fetch(apiUrl(`/api/stream/${id}`), {
      credentials: 'include',
      headers: {
        ...(await authHeaders()),
        Range: `bytes=0-${HEAD_BYTES - 1}`,
      },
    });
    if (!res.ok && res.status !== 206) return;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2048) return;
    headCache.set(id, { buf, at: Date.now() });
    while (headCache.size > MAX_HEAD) {
      const first = headCache.keys().next().value;
      if (first === undefined) break;
      headCache.delete(first);
    }
  } catch {
    /* ignore */
  } finally {
    inflightHead.delete(id);
  }
}

/** Met toute la piste en Cache Storage (play instantané au skip). */
export async function warmFull(id: string): Promise<void> {
  if (!isVideoId(id) || typeof caches === 'undefined') return;
  if (inflightFull.has(id)) return;
  inflightFull.add(id);
  try {
    const cache = await caches.open(FULL_CACHE);
    const url = apiUrl(`/api/stream/${id}`);
    const existing = await cache.match(url);
    if (existing) {
      bumpFull(id);
      return;
    }
    await warmFormat(id);
    const res = await fetch(url, {
      credentials: 'include',
      headers: await authHeaders(),
    });
    if (!res.ok) return;
    await cache.put(url, res.clone());
    bumpFull(id);
    await evictFull(cache);
  } catch {
    /* ignore */
  } finally {
    inflightFull.delete(id);
  }
}

function bumpFull(id: string) {
  fullOrder = fullOrder.filter((x) => x !== id);
  fullOrder.push(id);
}

async function evictFull(cache: Cache) {
  while (fullOrder.length > MAX_FULL) {
    const old = fullOrder.shift();
    if (!old) break;
    const url = apiUrl(`/api/stream/${old}`);
    await cache.delete(url);
    const blob = blobUrls.get(old);
    if (blob) {
      URL.revokeObjectURL(blob);
      blobUrls.delete(old);
    }
  }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const q = [...items];
  const workers = Array.from({ length: Math.min(limit, q.length) }, async () => {
    while (q.length) {
      const item = q.shift();
      if (item === undefined) break;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Précharge autour de l’index courant :
 * - warm format : jusqu’à 16 titres
 * - tête (Range) : 8 suivants + 2 précédents
 * - full cache : 3 suivants (play instantané)
 */
export function prefetchAround(
  trackIds: string[],
  currentIndex: number,
  opts?: { ahead?: number; behind?: number; fullAhead?: number },
) {
  const ahead = opts?.ahead ?? 10;
  const behind = opts?.behind ?? 2;
  const fullAhead = opts?.fullAhead ?? 3;
  const ids = trackIds.filter(isVideoId);
  if (!ids.length) return;

  const idx = Math.max(0, Math.min(currentIndex, ids.length - 1));
  const window: string[] = [];
  for (let i = Math.max(0, idx - behind); i < ids.length && i <= idx + ahead; i++) {
    window.push(ids[i]);
  }
  const unique = [...new Set(window)];

  void warmFormats(unique).then(() =>
    runPool([...new Set([ids[idx], ...unique])], HEAD_CONCURRENCY, warmHead),
  );

  const fullIds: string[] = [];
  for (let i = 1; i <= fullAhead; i++) {
    const t = ids[idx + i];
    if (t) fullIds.push(t);
  }
  void runPool(fullIds, FULL_CONCURRENCY, warmFull);
}

/** URL de lecture : blob cache full > stream (tête déjà chaude côté navigateur/API). */
export async function resolvePrefetchedPlayUrl(trackId: string): Promise<string | null> {
  if (!isVideoId(trackId) || typeof caches === 'undefined') return null;
  try {
    const cached = blobUrls.get(trackId);
    if (cached) return cached;
    const cache = await caches.open(FULL_CACHE);
    const hit = await cache.match(apiUrl(`/api/stream/${trackId}`));
    if (!hit) return null;
    const blob = await hit.blob();
    if (blob.size < 4096) return null;
    const url = URL.createObjectURL(blob);
    const prev = blobUrls.get(trackId);
    if (prev) URL.revokeObjectURL(prev);
    blobUrls.set(trackId, url);
    bumpFull(trackId);
    return url;
  } catch {
    return null;
  }
}

export function prefetchStats() {
  return {
    heads: headCache.size,
    warmed: warmDone.size,
    full: fullOrder.length,
  };
}
