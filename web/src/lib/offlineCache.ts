import { openDB } from 'idb';
import { apiUrl, getToken, type Track } from '../api';

const DB_NAME = 'ytmusic-offline';
const STORE = 'audio';
const META = 'meta';

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META);
    },
  });
}

export async function cacheAudioBlob(trackId: string, blob: Blob, track?: Track) {
  const database = await db();
  await database.put(STORE, blob, trackId);
  if (track) await database.put(META, track, trackId);
}

export async function getCachedAudio(trackId: string): Promise<Blob | undefined> {
  const database = await db();
  return database.get(STORE, trackId);
}

export async function getCachedMeta(trackId: string): Promise<Track | undefined> {
  const database = await db();
  return database.get(META, trackId);
}

export async function listCachedIds(): Promise<string[]> {
  const database = await db();
  return database.getAllKeys(STORE) as Promise<string[]>;
}

export async function removeCached(trackId: string) {
  const database = await db();
  await database.delete(STORE, trackId);
  await database.delete(META, trackId);
}

export async function downloadAndCache(track: Track) {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(`/api/stream/${track.id}`), {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Téléchargement impossible');
  const blob = await res.blob();
  await cacheAudioBlob(track.id, blob, track);
  await fetch(apiUrl(`/api/download/${track.id}`), {
    method: 'POST',
    credentials: 'include',
    headers,
  }).catch(() => undefined);
  return blob;
}

/** Stream proxy same-origin (sync) — pour lancer play() sans await (geste utilisateur). */
export function streamProxyUrl(trackId: string): string {
  const token = getToken();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return apiUrl(`/api/stream/${trackId}${q}`);
}

export async function resolvePlayUrl(trackId: string): Promise<string> {
  const cached = await getCachedAudio(trackId);
  if (cached) return URL.createObjectURL(cached);
  return streamProxyUrl(trackId);
}
