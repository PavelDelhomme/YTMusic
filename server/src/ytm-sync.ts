import { Innertube, UniversalCache, ClientType } from 'youtubei.js';
import { extractThumbs, mapAny } from './mappers.js';
import {
  addToPlaylist,
  createPlaylist,
  getFullLibrary,
  isTrackLiked,
  listPlaylists,
  saveAlbum,
  saveArtist,
  toggleLikePlaylist,
  toggleLikeTrack,
} from './library.js';
import { getYtmCredentials, markYtmSynced, saveYtmOauth } from './ytm-account.js';
import type { Track } from './types.js';

const userSessions = new Map<string, Innertube>();

type PendingOauth = {
  yt: Innertube;
  verificationUrl: string;
  userCode: string;
  expiresIn: number;
  done: boolean;
  error?: string;
};

const pendingOauth = new Map<string, PendingOauth>();

export async function getYTForUser(userId: string): Promise<Innertube> {
  const cached = userSessions.get(userId);
  if (cached) return cached;

  const creds = getYtmCredentials(userId);
  if (!creds) throw new Error('Compte YouTube Music non connecté');

  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    client_type: ClientType.WEB,
    cookie: creds.cookie,
  });

  if (creds.oauth && !creds.cookie) {
    await yt.session.signIn(creds.oauth as any);
  }

  userSessions.set(userId, yt);
  return yt;
}

export function clearYtmSession(userId: string) {
  userSessions.delete(userId);
  pendingOauth.delete(userId);
}

function collectItems(lib: any): any[] {
  const out: any[] = [];
  for (const section of lib?.contents || []) {
    const items = section?.contents || section?.items || [];
    if (Array.isArray(items)) out.push(...items);
  }
  return out;
}

async function collectAllFiltered(yt: Innertube, filterHints: string[]) {
  const base = await yt.music.getLibrary();
  const filters = (base.filters || []).map(String);
  const picked = filterHints.find((h) =>
    filters.some((f) => f.toLowerCase().includes(h.toLowerCase())),
  );

  let page = base;
  if (picked) {
    const match = filters.find((f) => f.toLowerCase().includes(picked.toLowerCase())) || picked;
    try {
      page = await base.applyFilter(match);
    } catch {
      /* keep base */
    }
  }

  const items = collectItems(page);
  let guard = 0;
  let cur: any = page;
  while (cur?.has_continuation && guard < 40) {
    cur = await cur.getContinuation();
    const cont = cur?.contents;
    const more = cont?.contents || cont?.items || [];
    if (Array.isArray(more)) items.push(...more);
    guard += 1;
  }
  return items;
}

async function fetchPlaylistTracks(yt: Innertube, playlistId: string): Promise<{ title: string; tracks: Track[] }> {
  const id = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
  const playlist = await yt.music.getPlaylist(id);
  const header = (playlist as any).header || {};
  const cover = extractThumbs(header, playlist);
  const title = String(header.title?.text || header.title || 'Playlist');
  const contents = (playlist as any).contents || (playlist as any).items || [];
  const tracks = contents
    .map((c: any) => mapAny(c, cover))
    .filter(Boolean)
    .map((t: Track) => {
      if (!t.thumbnails?.length && cover.length) t.thumbnails = cover;
      return t;
    }) as Track[];
  return { title, tracks };
}

function ensureLiked(userId: string, track: Track) {
  if (!track?.id) return false;
  if (isTrackLiked(userId, track.id)) return false;
  toggleLikeTrack(userId, track);
  return true;
}

function ensureLikedPlaylist(userId: string, playlist: Record<string, unknown>) {
  const id = String(playlist.id || '');
  if (!id) return false;
  const lib = getFullLibrary(userId);
  if (lib.likedPlaylists.some((p: any) => String(p.id) === id)) return false;
  toggleLikePlaylist(userId, playlist);
  return true;
}

function upsertLocalPlaylist(userId: string, name: string, ytmId: string, tracks: Track[]) {
  const existing = listPlaylists(userId).find(
    (p) => p.description.includes(`ytm:${ytmId}`) || p.name === name,
  );
  let pl = existing;
  if (!pl) {
    pl = createPlaylist(userId, name, `Importé depuis YouTube Music · ytm:${ytmId}`);
  }
  let added = 0;
  for (const t of tracks) {
    const before = pl.tracks.length;
    pl = addToPlaylist(userId, pl.id, t);
    if (pl.tracks.length > before) added += 1;
  }
  return { playlistId: pl.id, added };
}

export type SyncStats = {
  songs: number;
  albums: number;
  artists: number;
  playlists: number;
  playlistTracks: number;
  likedSongsPlaylist: number;
};

export async function syncYtmLibrary(userId: string): Promise<{
  stats: SyncStats;
  library: ReturnType<typeof getFullLibrary>;
}> {
  const yt = await getYTForUser(userId);
  const stats: SyncStats = {
    songs: 0,
    albums: 0,
    artists: 0,
    playlists: 0,
    playlistTracks: 0,
    likedSongsPlaylist: 0,
  };

  try {
    const liked = await fetchPlaylistTracks(yt, 'LM');
    for (const t of liked.tracks || []) {
      if (ensureLiked(userId, t)) {
        stats.songs += 1;
        stats.likedSongsPlaylist += 1;
      }
    }
  } catch (e) {
    console.warn('sync LM', e);
  }

  try {
    const songItems = await collectAllFiltered(yt, ['song', 'titre', 'track', 'morceau']);
    for (const item of songItems) {
      const m = mapAny(item);
      if (m && (m.type === 'song' || m.type === 'video') && ensureLiked(userId, m)) stats.songs += 1;
    }
  } catch (e) {
    console.warn('sync songs', e);
  }

  try {
    const albumItems = await collectAllFiltered(yt, ['album']);
    for (const item of albumItems) {
      const m = mapAny(item);
      if (!m?.id) continue;
      if (m.type === 'album' || String(m.id).startsWith('MPREb')) {
        saveAlbum(userId, {
          id: m.id,
          title: m.title,
          artists: m.artists,
          thumbnails: m.thumbnails,
          type: 'album',
        });
        stats.albums += 1;
      }
    }
  } catch (e) {
    console.warn('sync albums', e);
  }

  try {
    const artistItems = await collectAllFiltered(yt, ['artist', 'artiste']);
    for (const item of artistItems) {
      const m = mapAny(item);
      if (!m?.id) continue;
      if (m.type === 'artist' || String(m.id).startsWith('UC')) {
        saveArtist(userId, {
          id: m.id,
          title: m.title,
          name: m.title,
          thumbnails: m.thumbnails,
          type: 'artist',
        });
        stats.artists += 1;
      }
    }
  } catch (e) {
    console.warn('sync artists', e);
  }

  try {
    const playlistItems = await collectAllFiltered(yt, ['playlist', 'liste']);
    for (const item of playlistItems) {
      const m = mapAny(item);
      if (!m?.id) continue;
      if (
        !(
          m.type === 'playlist' ||
          m.id.startsWith('PL') ||
          m.id.startsWith('VL') ||
          m.id.startsWith('RD')
        )
      ) {
        continue;
      }
      if (
        ensureLikedPlaylist(userId, {
          id: m.id,
          title: m.title,
          thumbnails: m.thumbnails,
          type: 'playlist',
        })
      ) {
        stats.playlists += 1;
      }
      try {
        const full = await fetchPlaylistTracks(yt, m.id);
        const mirror = upsertLocalPlaylist(
          userId,
          full.title || m.title,
          m.id,
          (full.tracks || []).slice(0, 200),
        );
        stats.playlistTracks += mirror.added;
      } catch {
        /* playlist privée / indispo */
      }
    }
  } catch (e) {
    console.warn('sync playlists', e);
  }

  const summary = `+${stats.songs} titres, ${stats.albums} albums, ${stats.artists} artistes, ${stats.playlists} playlists`;
  markYtmSynced(userId, summary);
  return { stats, library: getFullLibrary(userId) };
}

/** Démarre OAuth device YouTube ; le client affiche le code puis poll /oauth/status. */
export async function startYtmDeviceOauth(userId: string) {
  clearYtmSession(userId);
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    client_type: ClientType.WEB,
  });

  const pending: PendingOauth = {
    yt,
    verificationUrl: '',
    userCode: '',
    expiresIn: 0,
    done: false,
  };
  pendingOauth.set(userId, pending);

  yt.session.on('auth-pending', (data) => {
    pending.verificationUrl = data.verification_url;
    pending.userCode = data.user_code;
    pending.expiresIn = data.expires_in;
  });

  yt.session.on('auth', ({ credentials }) => {
    saveYtmOauth(userId, credentials as unknown as Record<string, unknown>);
    userSessions.set(userId, yt);
    pending.done = true;
  });

  yt.session.on('auth-error', (err) => {
    pending.error = String(err?.message || err);
    pending.done = true;
  });

  void yt.session.signIn().catch((err) => {
    pending.error = String(err?.message || err);
    pending.done = true;
  });

  // Attendre le code device (auth-pending)
  for (let i = 0; i < 50; i++) {
    if (pending.userCode) break;
    if (pending.error) throw new Error(pending.error);
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!pending.userCode) throw new Error('Impossible d’obtenir le code Google TV');

  return {
    verificationUrl: pending.verificationUrl,
    userCode: pending.userCode,
    expiresIn: pending.expiresIn,
  };
}

export function getYtmOauthStatus(userId: string) {
  const account = getYtmCredentials(userId);
  if (account) return { status: 'connected' as const };
  const pending = pendingOauth.get(userId);
  if (!pending) return { status: 'idle' as const };
  if (pending.error) return { status: 'error' as const, error: pending.error };
  if (pending.done) return { status: 'connected' as const };
  return {
    status: 'pending' as const,
    verificationUrl: pending.verificationUrl,
    userCode: pending.userCode,
  };
}
