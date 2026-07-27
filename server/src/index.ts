import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  getHome,
  getHomeMore,
  getExplore,
  search,
  searchSuggestions,
  getTrack,
  getUpNext,
  getRelated,
  getAlbumRadio,
  getArtistRadio,
  getLyrics,
  getArtist,
  getAlbum,
  getPlaylist,
} from './yt.js';
import {
  getFullLibrary,
  toggleLikeTrack,
  toggleLikePlaylist,
  saveAlbum,
  removeAlbum,
  saveArtist,
  removeArtist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  reorderPlaylist,
  addHistory,
  getHistory,
  getTopListened,
  listDownloads,
  markDownloaded,
  listPlaylists,
} from './library.js';
import { handleStream, downloadTrack, cachePath } from './stream.js';
import { importByKind, importByQueryOrUrl } from './import.js';
import { handleOfflineStatus, startOfflineCollection } from './offline.js';
import { handleImageProxy } from './img.js';
import { deployInfo, getBuildJob, startBuild } from './admin.js';
import {
  beginAuthentication,
  beginRegistration,
  deletePasskey,
  finishAuthentication,
  finishRegistration,
  getOrigin,
  getRpID,
  listPasskeys,
} from './passkeys.js';
import {
  authConfig,
  authOptional,
  authRequired,
  ensureUser,
  loginGoogle,
  loginLocal,
  registerLocal,
  signToken,
  verifyToken,
} from './auth.js';
import { findUserByEmail, createUser, publicUser, updateUserProfile, findUserById, isAdminUser } from './db.js';
import { detachSocket, getHubPublic, handleSessionMessage } from './sessions.js';
import type { Track } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(authOptional);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: process.env.BUILD_SHA || process.env.npm_package_version || 'dev',
    ref: process.env.BUILD_REF || 'local',
    ytdlp: existsSync(join(ROOT, 'bin', 'yt-dlp')),
    auth: authConfig(),
  });
});

app.get('/api/auth/config', (_req, res) => res.json(authConfig()));
app.get('/api/auth/me', ensureUser, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'email et password requis' });
      return;
    }
    const result = await registerLocal(String(email), String(password), String(name || ''));
    res.cookie('ytm_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await loginLocal(String(req.body?.email || ''), String(req.body?.password || ''));
    res.cookie('ytm_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const result = await loginGoogle(String(req.body?.credential || req.body?.idToken || ''));
    res.cookie('ytm_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('ytm_token');
  res.json({ ok: true });
});

app.get('/api/img', (req, res) => void handleImageProxy(req, res));

app.patch('/api/auth/profile', authRequired, (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Crée un compte pour modifier ton profil' });
      return;
    }
    const user = updateUserProfile(req.userId!, {
      name: req.body?.name,
      email: req.body?.email,
      picture: req.body?.picture,
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.get('/api/auth/passkeys', authRequired, (req, res) => {
  if (req.user?.isGuest) {
    res.status(400).json({ error: 'Compte requis' });
    return;
  }
  res.json({ passkeys: listPasskeys(req.userId!) });
});

app.post('/api/auth/passkeys/register/options', authRequired, async (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Compte requis pour enregistrer une passkey' });
      return;
    }
    const rpID = getRpID(req.hostname);
    const options = await beginRegistration(
      req.userId!,
      req.user!.email,
      req.user!.name,
      rpID,
    );
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/passkeys/register/verify', authRequired, async (req, res) => {
  try {
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || req.hostname);
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
    // Prefer client origin for WebAuthn (Vite :5173 in dev)
    const origin = String(req.headers.origin || getOrigin(host, proto));
    const rpID = getRpID(new URL(origin).hostname);
    const result = await finishRegistration(
      req.userId!,
      req.body?.credential || req.body,
      rpID,
      origin,
      req.body?.name,
    );
    res.json({ ok: true, passkey: result, passkeys: listPasskeys(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.delete('/api/auth/passkeys/:id', authRequired, (req, res) => {
  const ok = deletePasskey(req.userId!, String(req.params.id));
  res.json({ ok, passkeys: listPasskeys(req.userId!) });
});

app.post('/api/auth/passkeys/login/options', async (req, res) => {
  try {
    const origin = String(req.headers.origin || '');
    const rpID = origin ? getRpID(new URL(origin).hostname) : getRpID(req.hostname);
    const options = await beginAuthentication(rpID, req.body?.email ? String(req.body.email) : undefined);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/passkeys/login/verify', async (req, res) => {
  try {
    const origin = String(req.headers.origin || getOrigin(req.get('host') || undefined, req.protocol));
    const rpID = getRpID(new URL(origin).hostname);
    const userId = await finishAuthentication(req.body?.credential || req.body, rpID, origin);
    const user = findUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'Utilisateur introuvable' });
      return;
    }
    const token = await signToken(user);
    res.cookie('ytm_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json({ user: publicUser(user), token });
  } catch (err) {
    res.status(401).json({ error: String((err as Error).message || err) });
  }
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authRequired(req, res, () => {
    const user = findUserById(req.userId!);
    if (!user || !isAdminUser(user)) {
      res.status(403).json({ error: 'Admin requis' });
      return;
    }
    next();
  });
}

app.get('/api/admin/status', requireAdmin, (_req, res) => {
  res.json(deployInfo(PORT));
});

app.post('/api/admin/build', requireAdmin, (_req, res) => {
  res.json(startBuild());
});

app.get('/api/admin/build', requireAdmin, (_req, res) => {
  res.json(getBuildJob());
});

// Deploy info also available lightly for logged-in users (QR on profile) — LAN URLs only
app.get('/api/deploy/info', ensureUser, (_req, res) => {
  const info = deployInfo(PORT);
  res.json({
    urls: info.urls,
    lan: info.lan,
    port: info.port,
    built: info.built,
  });
});

app.get('/api/home', ensureUser, async (req, res) => {
  try {
    const personal: Awaited<ReturnType<typeof getHome>> = [];
    const history = getHistory(req.userId!, 40);
    const top = getTopListened(req.userId!, 25);
    const likedPl = getFullLibrary(req.userId!).likedPlaylists || [];
    const localPl = listPlaylists(req.userId!);

    if (history.length) {
      personal.push({ title: 'Écouté récemment', items: history.slice(0, 20) });
    }
    if (top.length >= 3) {
      personal.push({ title: 'Tes titres les plus écoutés', items: top.slice(0, 20) });
    }
    if (likedPl.length) {
      personal.push({
        title: 'Playlists aimées',
        items: likedPl.map((p: any) => ({
          id: p.id,
          title: p.title || p.name,
          artists: p.author ? [{ name: String(p.author) }] : [],
          thumbnails: p.thumbnails || [],
          type: 'playlist' as const,
        })),
      });
    }
    if (localPl.length) {
      personal.push({
        title: 'Tes playlists',
        items: localPl.map((p) => ({
          id: `local:${p.id}`,
          title: p.name,
          artists: [{ name: `${p.tracks.length} titres` }],
          thumbnails: p.coverUrl
            ? [{ url: p.coverUrl }]
            : p.tracks[0]?.thumbnails || [],
          type: 'playlist' as const,
        })),
      });
    }

    // Quick picks from top track radio
    if (top[0] && /^[a-zA-Z0-9_-]{11}$/.test(top[0].id)) {
      try {
        const { radio } = await getRelated(top[0].id);
        if (radio.length) {
          personal.push({ title: 'Rapide · pour toi', items: radio.slice(0, 20) });
        }
      } catch {
        /* ignore */
      }
    }

    const ytHome = await getHome();
    const shelves = [...personal, ...ytHome];
    const seeds = [...top, ...history]
      .map((t) => t.id)
      .filter((id) => /^[a-zA-Z0-9_-]{11}$/.test(id))
      .slice(0, 24);

    res.json({ shelves, seeds, hasMore: true, page: 0 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/home/more', ensureUser, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const seeds = String(req.query.seeds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await getHomeMore(page, seeds);
    res.json({ ...result, page });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/explore', async (_req, res) => {
  try {
    res.json({ shelves: await getExplore() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.status(400).json({ error: 'query requise' });
      return;
    }
    res.json(await search(q, String(req.query.filter || 'all')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search/suggestions', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ suggestions: [] });
      return;
    }
    res.json({ suggestions: await searchSuggestions(q) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/track/:id', ensureUser, async (req, res) => {
  try {
    const { track } = await getTrack(req.params.id);
    // Ne pas écrire l'historique ici : c'est fait dès le play (même partiel)
    res.json({
      track,
      streamUrl: `/api/stream/${track.id}`,
      cached: existsSync(cachePath(track.id)),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/history', ensureUser, (req, res) => {
  try {
    const track = req.body as Track;
    if (!track?.id) {
      res.status(400).json({ error: 'track requis' });
      return;
    }
    addHistory(req.userId!, track);
    res.json({ ok: true, history: getHistory(req.userId!, 500) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/history', ensureUser, (req, res) => {
  res.json({ history: getHistory(req.userId!, 500) });
});

app.get('/api/track/:id/upnext', async (req, res) => {
  try {
    res.json({ tracks: await getUpNext(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/track/:id/related', async (req, res) => {
  try {
    res.json(await getRelated(req.params.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/track/:id/lyrics', async (req, res) => {
  try {
    res.json({ lyrics: await getLyrics(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id', async (req, res) => {
  try {
    res.json(await getArtist(req.params.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id/radio', async (req, res) => {
  try {
    res.json({ tracks: await getArtistRadio(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id', async (req, res) => {
  try {
    res.json(await getAlbum(req.params.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id/radio', async (req, res) => {
  try {
    res.json({ tracks: await getAlbumRadio(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/playlist/:id', async (req, res) => {
  try {
    res.json(await getPlaylist(req.params.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/stream/:id', (req, res) => {
  void handleStream(req, res);
});

app.post('/api/download/:id', ensureUser, async (req, res) => {
  try {
    const path = await downloadTrack(req.params.id);
    markDownloaded(req.userId!, req.params.id, path);
    res.json({ ok: true, path, streamUrl: `/api/stream/${req.params.id}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/library', ensureUser, (req, res) => {
  res.json(getFullLibrary(req.userId!));
});

app.post('/api/library/like', ensureUser, (req, res) => {
  try {
    const track = req.body as Track;
    if (!track?.id) {
      res.status(400).json({ error: 'track requis' });
      return;
    }
    const result = toggleLikeTrack(req.userId!, track);
    res.json({ ...result, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/library/like-playlist', ensureUser, (req, res) => {
  try {
    res.json({
      ...toggleLikePlaylist(req.userId!, req.body),
      library: getFullLibrary(req.userId!),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/library/albums', ensureUser, (req, res) => {
  try {
    res.json({ album: saveAlbum(req.userId!, req.body), library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/albums/:id', ensureUser, (req, res) => {
  removeAlbum(req.userId!, req.params.id);
  res.json({ ok: true, library: getFullLibrary(req.userId!) });
});

app.post('/api/library/artists', ensureUser, (req, res) => {
  try {
    res.json({ artist: saveArtist(req.userId!, req.body), library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/artists/:id', ensureUser, (req, res) => {
  removeArtist(req.userId!, req.params.id);
  res.json({ ok: true, library: getFullLibrary(req.userId!) });
});

app.post('/api/library/playlists', ensureUser, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim() || 'Nouvelle playlist';
    res.json(createPlaylist(req.userId!, name, String(req.body?.description || '')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/library/playlists/:id', ensureUser, (req, res) => {
  try {
    res.json(updatePlaylist(req.userId!, req.params.id, req.body || {}));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/playlists/:id', ensureUser, (req, res) => {
  try {
    deletePlaylist(req.userId!, req.params.id);
    res.json({ ok: true, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/library/playlists/:id/tracks', ensureUser, (req, res) => {
  try {
    res.json(addToPlaylist(req.userId!, req.params.id, req.body as Track));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/playlists/:id/tracks/:trackId', ensureUser, (req, res) => {
  try {
    res.json(removeFromPlaylist(req.userId!, req.params.id, req.params.trackId));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/library/playlists/:id/reorder', ensureUser, (req, res) => {
  try {
    res.json(reorderPlaylist(req.userId!, req.params.id, (req.body?.trackIds || []) as string[]));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/import', ensureUser, async (req, res) => {
  try {
    const kind = req.body?.kind as 'track' | 'album' | 'artist' | 'playlist' | undefined;
    const id = req.body?.id as string | undefined;
    const input = String(req.body?.url || req.body?.query || '').trim();
    if (kind && id) {
      const result = await importByKind(req.userId!, kind, id, req.body?.options);
      res.json({ ...result, library: getFullLibrary(req.userId!) });
      return;
    }
    if (!input) {
      res.status(400).json({ error: 'url, query ou kind+id requis' });
      return;
    }
    const result = await importByQueryOrUrl(req.userId!, input, req.body?.options);
    res.json({ ...result, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message || err) });
  }
});

app.get('/api/offline', ensureUser, handleOfflineStatus);
app.get('/api/offline/downloads', ensureUser, (req, res) => {
  res.json({ downloads: listDownloads(req.userId!) });
});
app.post('/api/offline/start', ensureUser, async (req, res) => {
  try {
    const kind = String(req.body?.kind || 'playlist') as 'album' | 'playlist' | 'artist' | 'liked';
    const targetId = String(req.body?.targetId || 'liked');
    res.json(await startOfflineCollection(req.userId!, kind, targetId));
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message || err) });
  }
});

app.get('/api/session', ensureUser, (req, res) => {
  res.json(getHubPublic(req.userId!));
});

const clientDist = join(ROOT, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

async function resolveWsUser(req: import('node:http').IncomingMessage) {
  const url = new URL(req.url || '', 'http://localhost');
  const token = url.searchParams.get('token') || '';
  const deviceHint = url.searchParams.get('device') || '';

  if (token) {
    try {
      const user = await verifyToken(token);
      return { userId: user.id, name: user.name };
    } catch {
      /* guest */
    }
  }

  const device =
    deviceHint ||
    createHash('sha256')
      .update(req.socket.remoteAddress || 'local')
      .digest('hex')
      .slice(0, 24);
  const email = `guest-${device}@local.ytmusic`;
  let user = findUserByEmail(email);
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(randomBytes(8).toString('hex'), salt, 64).toString('hex');
    user = createUser({ email, name: 'Invité', passwordHash: `${salt}:${hash}` });
  }
  return { userId: user.id, name: publicUser(user).name };
}

wss.on('connection', (ws, req) => {
  void (async () => {
    const { userId, name } = await resolveWsUser(req);
    ws.on('message', (data) => {
      handleSessionMessage(userId, ws, String(data), { defaultName: name });
    });
    ws.on('close', () => detachSocket(ws));
    ws.on('error', () => detachSocket(ws));
    ws.send(JSON.stringify({ type: 'hello', userId }));
  })();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`YTMusic API → http://localhost:${PORT}`);
  console.log(`YTMusic LAN → http://0.0.0.0:${PORT} (toutes interfaces)`);
  console.log(`YTMusic WS  → ws://localhost:${PORT}/ws`);
});
