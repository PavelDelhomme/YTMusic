import { randomUUID } from 'node:crypto';
import { db, getTrackPayload, upsertTrack } from './db.js';
import type { Track } from './types.js';

export type LibraryPlaylist = {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
};

function parseTrack(row: { payload?: string; track_id?: string }): Track | null {
  if (row.payload) return JSON.parse(row.payload) as Track;
  if (row.track_id) return getTrackPayload(row.track_id);
  return null;
}

export function getFullLibrary(userId: string) {
  const likedRows = db
    .prepare(
      `SELECT t.payload FROM liked_tracks l
       JOIN tracks_cache t ON t.id = l.track_id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
    )
    .all(userId) as { payload: string }[];

  const likedPlaylists = (
    db
      .prepare(
        `SELECT playlist_id, payload FROM liked_playlists WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(userId) as { playlist_id: string; payload: string }[]
  ).map((r) => JSON.parse(r.payload));

  const albums = (
    db
      .prepare(`SELECT payload FROM library_albums WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload));

  const artists = (
    db
      .prepare(`SELECT payload FROM library_artists WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload));

  const playlists = listPlaylists(userId);

  const history = getHistory(userId, 500);

  const downloaded = (
    db
      .prepare(`SELECT track_id FROM downloads WHERE user_id = ? AND status = 'ready'`)
      .all(userId) as { track_id: string }[]
  ).map((r) => r.track_id);

  return {
    liked: likedRows.map((r) => JSON.parse(r.payload) as Track),
    likedPlaylists,
    albums,
    artists,
    playlists,
    history,
    downloaded,
  };
}

export function toggleLikeTrack(userId: string, track: Track) {
  upsertTrack(track);
  const existing = db
    .prepare('SELECT 1 FROM liked_tracks WHERE user_id = ? AND track_id = ?')
    .get(userId, track.id);
  if (existing) {
    db.prepare('DELETE FROM liked_tracks WHERE user_id = ? AND track_id = ?').run(userId, track.id);
    return { liked: false };
  }
  db.prepare('INSERT INTO liked_tracks (user_id, track_id, created_at) VALUES (?, ?, ?)').run(
    userId,
    track.id,
    Date.now(),
  );
  return { liked: true };
}

export function isTrackLiked(userId: string, trackId: string) {
  return Boolean(
    db.prepare('SELECT 1 FROM liked_tracks WHERE user_id = ? AND track_id = ?').get(userId, trackId),
  );
}

export function toggleLikePlaylist(userId: string, playlist: Record<string, unknown>) {
  const id = String(playlist.id || '');
  if (!id) throw new Error('playlist id manquant');
  const existing = db
    .prepare('SELECT 1 FROM liked_playlists WHERE user_id = ? AND playlist_id = ?')
    .get(userId, id);
  if (existing) {
    db.prepare('DELETE FROM liked_playlists WHERE user_id = ? AND playlist_id = ?').run(userId, id);
    return { liked: false };
  }
  db.prepare(
    'INSERT INTO liked_playlists (user_id, playlist_id, payload, created_at) VALUES (?, ?, ?, ?)',
  ).run(userId, id, JSON.stringify(playlist), Date.now());
  return { liked: true };
}

export function saveAlbum(userId: string, album: Record<string, unknown>) {
  const id = String(album.id || '');
  if (!id) throw new Error('album id manquant');
  db.prepare(
    `INSERT INTO library_albums (user_id, album_id, payload, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, album_id) DO UPDATE SET payload = excluded.payload`,
  ).run(userId, id, JSON.stringify(album), Date.now());
  return album;
}

export function removeAlbum(userId: string, albumId: string) {
  db.prepare('DELETE FROM library_albums WHERE user_id = ? AND album_id = ?').run(userId, albumId);
}

export function saveArtist(userId: string, artist: Record<string, unknown>) {
  const id = String(artist.id || '');
  if (!id) throw new Error('artist id manquant');
  db.prepare(
    `INSERT INTO library_artists (user_id, artist_id, payload, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, artist_id) DO UPDATE SET payload = excluded.payload`,
  ).run(userId, id, JSON.stringify(artist), Date.now());
  return artist;
}

export function removeArtist(userId: string, artistId: string) {
  db.prepare('DELETE FROM library_artists WHERE user_id = ? AND artist_id = ?').run(userId, artistId);
}

export function addHistory(userId: string, track: Track) {
  if (!track?.id) return;
  upsertTrack(track);
  // Ensure play_count column
  try {
    db.exec('ALTER TABLE history ADD COLUMN play_count INTEGER DEFAULT 1');
  } catch {
    /* already exists */
  }
  const existing = db
    .prepare('SELECT play_count FROM history WHERE user_id = ? AND track_id = ?')
    .get(userId, track.id) as { play_count: number } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE history SET played_at = ?, play_count = COALESCE(play_count, 1) + 1 WHERE user_id = ? AND track_id = ?`,
    ).run(Date.now(), userId, track.id);
  } else {
    db.prepare(
      `INSERT INTO history (user_id, track_id, played_at, play_count) VALUES (?, ?, ?, 1)`,
    ).run(userId, track.id, Date.now());
  }
}

export function getTopListened(userId: string, limit = 30): Track[] {
  try {
    db.exec('ALTER TABLE history ADD COLUMN play_count INTEGER DEFAULT 1');
  } catch {
    /* ok */
  }
  return (
    db
      .prepare(
        `SELECT t.payload, COALESCE(h.play_count, 1) as play_count FROM history h
         JOIN tracks_cache t ON t.id = h.track_id
         WHERE h.user_id = ?
         ORDER BY COALESCE(h.play_count, 1) DESC, h.played_at DESC
         LIMIT ?`,
      )
      .all(userId, limit) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload) as Track);
}

export function getHistory(userId: string, limit = 500): Track[] {
  return (
    db
      .prepare(
        `SELECT t.payload FROM history h
         JOIN tracks_cache t ON t.id = h.track_id
         WHERE h.user_id = ?
         ORDER BY h.played_at DESC LIMIT ?`,
      )
      .all(userId, limit) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload) as Track);
}

export function listPlaylists(userId: string): LibraryPlaylist[] {
  const rows = db
    .prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as {
    id: string;
    name: string;
    description: string;
    cover_url: string | null;
    created_at: number;
    updated_at: number;
  }[];

  return rows.map((p) => {
    const tracks = (
      db
        .prepare(
          `SELECT t.payload FROM playlist_tracks pt
           JOIN tracks_cache t ON t.id = pt.track_id
           WHERE pt.playlist_id = ?
           ORDER BY pt.position ASC`,
        )
        .all(p.id) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload) as Track);

    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      coverUrl: p.cover_url || tracks[0]?.thumbnails?.[0]?.url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      tracks,
    };
  });
}

export function createPlaylist(userId: string, name: string, description = '') {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO playlists (id, user_id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, name, description, now, now);
  return listPlaylists(userId).find((p) => p.id === id)!;
}

export function updatePlaylist(
  userId: string,
  playlistId: string,
  patch: { name?: string; description?: string },
) {
  const pl = db
    .prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?')
    .get(playlistId, userId);
  if (!pl) throw new Error('Playlist introuvable');
  db.prepare(
    `UPDATE playlists SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
  ).run(patch.name ?? null, patch.description ?? null, Date.now(), playlistId);
  return listPlaylists(userId).find((p) => p.id === playlistId)!;
}

export function deletePlaylist(userId: string, playlistId: string) {
  const pl = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .get(playlistId, userId);
  if (!pl) throw new Error('Playlist introuvable');
  db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
}

export function addToPlaylist(userId: string, playlistId: string, track: Track) {
  const pl = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .get(playlistId, userId);
  if (!pl) throw new Error('Playlist introuvable');
  upsertTrack(track);
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_tracks WHERE playlist_id = ?')
    .get(playlistId) as { m: number };
  db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(playlist_id, track_id) DO NOTHING`,
  ).run(playlistId, track.id, max.m + 1, Date.now());
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  return listPlaylists(userId).find((p) => p.id === playlistId)!;
}

export function removeFromPlaylist(userId: string, playlistId: string, trackId: string) {
  const pl = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .get(playlistId, userId);
  if (!pl) throw new Error('Playlist introuvable');
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(
    playlistId,
    trackId,
  );
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  return listPlaylists(userId).find((p) => p.id === playlistId)!;
}

export function reorderPlaylist(userId: string, playlistId: string, trackIds: string[]) {
  const pl = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .get(playlistId, userId);
  if (!pl) throw new Error('Playlist introuvable');
  const tx = db.transaction(() => {
    trackIds.forEach((id, i) => {
      db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?').run(
        i,
        playlistId,
        id,
      );
    });
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  });
  tx();
  return listPlaylists(userId).find((p) => p.id === playlistId)!;
}

export function markDownloaded(userId: string, trackId: string, path?: string) {
  db.prepare(
    `INSERT INTO downloads (user_id, track_id, status, path, created_at) VALUES (?, ?, 'ready', ?, ?)
     ON CONFLICT(user_id, track_id) DO UPDATE SET status = 'ready', path = excluded.path`,
  ).run(userId, trackId, path || null, Date.now());
}

export function listDownloads(userId: string) {
  return (
    db
      .prepare(
        `SELECT d.track_id, d.status, d.path, t.payload FROM downloads d
         LEFT JOIN tracks_cache t ON t.id = d.track_id
         WHERE d.user_id = ?
         ORDER BY d.created_at DESC`,
      )
      .all(userId) as { track_id: string; status: string; path: string | null; payload: string | null }[]
  ).map((r) => ({
    trackId: r.track_id,
    status: r.status,
    path: r.path,
    track: r.payload ? (JSON.parse(r.payload) as Track) : null,
  }));
}

export function createOfflineJob(
  userId: string,
  kind: 'album' | 'playlist' | 'artist-top' | 'tracks',
  targetId: string,
  total: number,
) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO offline_jobs (id, user_id, kind, target_id, status, progress, total, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', 0, ?, ?, ?)`,
  ).run(id, userId, kind, targetId, total, now, now);
  return id;
}

export function updateOfflineJob(id: string, progress: number, status?: string) {
  db.prepare(
    `UPDATE offline_jobs SET progress = ?, status = COALESCE(?, status), updated_at = ? WHERE id = ?`,
  ).run(progress, status || null, Date.now(), id);
}

export function listOfflineJobs(userId: string) {
  return db
    .prepare('SELECT * FROM offline_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(userId);
}

// silence unused
void parseTrack;
