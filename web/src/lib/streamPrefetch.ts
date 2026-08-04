import { apiUrl } from '../api';

const FULL_CACHE = 'ytm-stream-full-v1';

/** Nombre max de pistes dont on garde le début en mémoire */
const MAX_HEAD = 12;
/** Tête générique (~384 Ko) */
const HEAD_BYTES = 384 * 1024;
/** Prochain titre : plus d’octets pour un skip fluide */
const HEAD_NEXT_BYTES = 960 * 1024;
/** Pistes complètes en Cache Storage (instant play) — rester léger sur navigateur */
const MAX_FULL = 6;
/** Warm format API en parallèle */
const WARM_CONCURRENCY = 3;
/** Prefetch tête en parallèle */
const HEAD_CONCURRENCY = 2;
/** Prefetch full (lourd) — 1 seul à la fois pour ne pas étouffer le titre courant */
const FULL_CONCURRENCY = 1;

type HeadEntry = { buf: ArrayBuffer; at: number };

const headCache = new Map<string, HeadEntry>();
const warmDone = new Map<string, number>();
const inflightWarm = new Set<string>();
const inflightHead = new Set<string>();
const inflightFull = new Set<string>();
const blobUrls = new Map<string, string>();

let fullOrder: string[] = [];
/** Invalide les préchargements d’arrière-plan quand on change de titre trop vite. */
let prefetchGeneration = 0;

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

/** Annule / ignore les préchargements full/head en cours (changement de titre). */
export function bumpPrefetchGeneration() {
  prefetchGeneration += 1;
  return prefetchGeneration;
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
      body: JSON.stringify({ ids: need.slice(0, 16) }),
    });
    if (res.ok) {
      const now = Date.now();
      for (const id of need.slice(0, 16)) warmDone.set(id, now);
    } else {
      await runPool(need.slice(0, 8), WARM_CONCURRENCY, warmFormat);
    }
  } catch {
    await runPool(need.slice(0, 6), WARM_CONCURRENCY, warmFormat);
  }
}

/** Précharge le début du flux (Range) en RAM — démarrage quasi immédiat. */
export async function warmHead(id: string, gen?: number, bytes = HEAD_BYTES): Promise<void> {
  if (!isVideoId(id)) return;
  if (gen !== undefined && gen !== prefetchGeneration) return;
  if (headCache.has(id)) {
    touchLru(headCache, id, MAX_HEAD);
    return;
  }
  if (inflightHead.has(id)) return;
  inflightHead.add(id);
  try {
    if (gen !== undefined && gen !== prefetchGeneration) return;
    await warmFormat(id);
    if (gen !== undefined && gen !== prefetchGeneration) return;
    const res = await fetch(apiUrl(`/api/stream/${id}`), {
      credentials: 'include',
      headers: {
        ...(await authHeaders()),
        Range: `bytes=0-${bytes - 1}`,
      },
    });
    if (gen !== undefined && gen !== prefetchGeneration) return;
    if (!res.ok && res.status !== 206) return;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2048) return;
    if (gen !== undefined && gen !== prefetchGeneration) return;
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
export async function warmFull(id: string, gen?: number): Promise<void> {
  if (!isVideoId(id) || typeof caches === 'undefined') return;
  if (gen !== undefined && gen !== prefetchGeneration) return;
  if (inflightFull.has(id)) return;
  inflightFull.add(id);
  try {
    if (gen !== undefined && gen !== prefetchGeneration) return;
    const cache = await caches.open(FULL_CACHE);
    const url = apiUrl(`/api/stream/${id}`);
    const existing = await cache.match(url);
    if (existing) {
      bumpFull(id);
      return;
    }
    await warmFormat(id);
    if (gen !== undefined && gen !== prefetchGeneration) return;
    const res = await fetch(url, {
      credentials: 'include',
      headers: await authHeaders(),
    });
    if (gen !== undefined && gen !== prefetchGeneration) return;
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

async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  gen?: number,
) {
  const q = [...items];
  const workers = Array.from({ length: Math.min(limit, q.length) }, async () => {
    while (q.length) {
      if (gen !== undefined && gen !== prefetchGeneration) return;
      const item = q.shift();
      if (item === undefined) break;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Précharge autour de l’index courant — volontairement modéré pour ne pas
 * saturer le navigateur Linux (sinon le titre courant charge « dégueulasse »).
 * - warm format : fenêtre courte
 * - tête (Range) : 1 précédent + quelques suivants
 * - full cache : 1 suivant seulement, après un court délai
 */
export function prefetchAround(
  trackIds: string[],
  currentIndex: number,
  opts?: { ahead?: number; behind?: number; fullAhead?: number; delayFullMs?: number },
) {
  const ahead = opts?.ahead ?? 4;
  const behind = opts?.behind ?? 1;
  const fullAhead = opts?.fullAhead ?? 1;
  const delayFullMs = opts?.delayFullMs ?? 1800;
  const ids = trackIds.filter(isVideoId);
  if (!ids.length) return;

  const gen = bumpPrefetchGeneration();
  const idx = Math.max(0, Math.min(currentIndex, ids.length - 1));
  const around: string[] = [];
  for (let i = Math.max(0, idx - behind); i < ids.length && i <= idx + ahead; i++) {
    around.push(ids[i]);
  }
  const unique = [...new Set(around)];

  void warmFormats(unique).then(() => {
    if (gen !== prefetchGeneration) return;
    // Priorité : prochain titre d’abord
    const ordered = [
      ids[idx + 1],
      ids[idx],
      ids[idx + 2],
      ids[idx + 3],
      ids[idx + 4],
      ids[idx - 1],
    ].filter((id): id is string => Boolean(id) && unique.includes(id));
    return runPool([...new Set(ordered)], HEAD_CONCURRENCY, (id) => {
      const nextId = ids[idx + 1];
      const bytes = id === nextId ? HEAD_NEXT_BYTES : HEAD_BYTES;
      return warmHead(id, gen, bytes);
    }, gen);
  });

  const fullIds: string[] = [];
  for (let i = 1; i <= fullAhead; i++) {
    const t = ids[idx + i];
    if (t) fullIds.push(t);
  }
  if (fullIds.length) {
    globalThis.setTimeout(() => {
      if (gen !== prefetchGeneration) return;
      void runPool(fullIds, FULL_CONCURRENCY, (id) => warmFull(id, gen), gen);
    }, delayFullMs);
  }
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

/** True si cette URL blob est encore gérée par le prefetch (ne pas révoquer). */
export function isPrefetchBlobUrl(url: string): boolean {
  if (!url?.startsWith('blob:')) return false;
  for (const v of blobUrls.values()) {
    if (v === url) return true;
  }
  return false;
}

export function prefetchStats() {
  return {
    heads: headCache.size,
    warmed: warmDone.size,
    full: fullOrder.length,
    gen: prefetchGeneration,
  };
}
