import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __envDir = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(__envDir, '..', '..', '.env');
const serverEnv = join(__envDir, '..', '.env');
if (existsSync(rootEnv)) loadEnv({ path: rootEnv });
else if (existsSync(serverEnv)) loadEnv({ path: serverEnv });
else loadEnv();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { createServer } from 'node:http';
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
  accountRequired,
  authConfig,
  authOptional,
  authRequired,
  issueSession,
  loginGoogle,
  loginLocal,
  registerLocal,
  sessionCookieOptions,
  signToken,
  verifyToken,
} from './auth.js';
import {
  addPin,
  addRecoFeedback,
  addSearchHistory,
  followArtist,
  getPrefs,
  listFollows,
  listListenEvents,
  listPins,
  listSearchHistory,
  listWeights,
  recoAdminStats,
  recordListenEvent,
  removePin,
  savePrefs,
  saveWeights,
  unfollowArtist,
} from './prefs.js';
import {
  exploreReco,
  homeReco,
  radioForUser,
  RADIO_CATEGORIES,
  similarForUser,
  suggestSearch,
} from './reco.js';
import {
  consumeEmailToken,
  createEmailToken,
  insertTelemetry,
  listMailOutbox,
  listTelemetry,
  markEmailVerified,
  rotateRefreshToken,
  revokeRefreshToken,
  telemetryStats,
} from './platform.js';
import { sendVerificationEmail, getAppEnv, smtpPublicConfig, testSmtp } from './mail.js';
import {
  disableTotpForUser,
  enableTotpForUser,
  generateTotpSetup,
} from './totp.js';
import './platform.js';
import {
  disconnectYtm,
  getYtmAccountPublic,
  saveYtmCookie,
} from './ytm-account.js';
import {
  clearYtmSession,
  getYtmOauthStatus,
  startYtmDeviceOauth,
  syncYtmLibrary,
} from './ytm-sync.js';
import { findUserByEmail, createUser, publicUser, updateUserProfile, findUserById, isAdminUser } from './db.js';
import { detachSocket, getHubPublic, handleSessionMessage } from './sessions.js';
import type { Track } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8787);

function p(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return String(v[0] || '');
  return String(v || '');
}

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
app.get('/api/auth/me', authOptional, (req, res) => {
  if (!req.user || req.user.isGuest) {
    res.json({ user: null });
    return;
  }
  res.json({ user: req.user });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'email et password requis' });
      return;
    }
    const result = await registerLocal(String(email), String(password), String(name || ''));
    const opts = sessionCookieOptions();
    res.cookie('ytm_token', result.token, opts);
    res.cookie('ytm_refresh', result.refreshToken, { ...opts, httpOnly: true });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await loginLocal(String(req.body?.email || ''), String(req.body?.password || ''), {
      totp: req.body?.totp ? String(req.body.totp) : undefined,
      deviceLabel: String(req.body?.deviceLabel || req.headers['user-agent'] || 'web').slice(0, 120),
    });
    const opts = sessionCookieOptions();
    res.cookie('ytm_token', result.token, opts);
    res.cookie('ytm_refresh', result.refreshToken, { ...opts, httpOnly: true });
    res.json(result);
  } catch (err) {
    const msg = String((err as Error).message || err);
    if (msg === '2FA_REQUIRED' || (err as any).code === '2FA_REQUIRED') {
      res.status(401).json({ error: '2FA_REQUIRED', needs2fa: true });
      return;
    }
    res.status(401).json({ error: msg });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const result = await loginGoogle(
      String(req.body?.credential || req.body?.idToken || ''),
      String(req.body?.deviceLabel || 'google'),
    );
    const opts = sessionCookieOptions();
    res.cookie('ytm_token', result.token, opts);
    res.cookie('ytm_refresh', result.refreshToken, { ...opts, httpOnly: true });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const raw =
      String(req.body?.refreshToken || '') ||
      String((req as any).cookies?.ytm_refresh || '');
    if (!raw) {
      res.status(401).json({ error: 'refresh manquant' });
      return;
    }
    const rotated = rotateRefreshToken(raw, String(req.headers['user-agent'] || '').slice(0, 80));
    if (!rotated) {
      res.status(401).json({ error: 'refresh invalide ou expiré' });
      return;
    }
    const user = findUserById(rotated.userId);
    if (!user) {
      res.status(401).json({ error: 'utilisateur introuvable' });
      return;
    }
    const token = await signToken(user);
    const opts = sessionCookieOptions();
    res.cookie('ytm_token', token, opts);
    res.cookie('ytm_refresh', rotated.token, { ...opts, httpOnly: true });
    res.json({ user: publicUser(user), token, refreshToken: rotated.token });
  } catch (err) {
    res.status(401).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const raw = String((req as any).cookies?.ytm_refresh || req.body?.refreshToken || '');
  if (raw) revokeRefreshToken(raw);
  res.clearCookie('ytm_token');
  res.clearCookie('ytm_refresh');
  res.json({ ok: true });
});

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const token = String(req.body?.token || req.query?.token || '');
    const userId = consumeEmailToken(token, 'verify');
    if (!userId) {
      res.status(400).json({ error: 'Lien invalide ou expiré' });
      return;
    }
    markEmailVerified(userId);
    const user = findUserById(userId)!;
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/resend-verification', authRequired, async (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Compte requis' });
      return;
    }
    if (req.user?.emailVerified) {
      res.json({ ok: true, already: true });
      return;
    }
    const raw = createEmailToken(req.userId!, 'verify');
    await sendVerificationEmail(req.user!.email, req.user!.name, raw);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/2fa/setup', authRequired, (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Compte requis' });
      return;
    }
    const setup = generateTotpSetup(req.user!.email);
    res.json(setup);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/2fa/enable', authRequired, (req, res) => {
  try {
    enableTotpForUser(req.userId!, String(req.body?.secret || ''), String(req.body?.code || ''));
    const user = findUserById(req.userId!)!;
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/2fa/disable', authRequired, (req, res) => {
  try {
    disableTotpForUser(req.userId!, String(req.body?.code || ''));
    const user = findUserById(req.userId!)!;
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/telemetry', authOptional, (req, res) => {
  try {
    const b = req.body || {};
    const id = insertTelemetry({
      env: b.env || getAppEnv(),
      level: String(b.level || 'info'),
      kind: String(b.kind || 'client'),
      message: b.message ? String(b.message) : undefined,
      stack: b.stack ? String(b.stack) : undefined,
      url: b.url ? String(b.url) : undefined,
      userAgent: String(req.headers['user-agent'] || b.userAgent || ''),
      userId: req.user && !req.user.isGuest ? req.userId : undefined,
      deviceId: String(req.headers['x-device-id'] || b.deviceId || ''),
      meta: b.meta,
      batteryLevel: typeof b.batteryLevel === 'number' ? b.batteryLevel : null,
      batteryCharging: typeof b.batteryCharging === 'boolean' ? b.batteryCharging : null,
      perf: b.perf,
    });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
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
    const session = await issueSession(user, 'passkey');
    const opts = sessionCookieOptions();
    res.cookie('ytm_token', session.token, opts);
    res.cookie('ytm_refresh', session.refreshToken, { ...opts, httpOnly: true });
    res.json(session);
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
  res.json({ ...deployInfo(PORT), env: getAppEnv(), telemetry: telemetryStats() });
});

app.get('/api/admin/telemetry', requireAdmin, (req, res) => {
  res.json({
    stats: telemetryStats(),
    events: listTelemetry({
      level: req.query.level ? String(req.query.level) : undefined,
      limit: Number(req.query.limit || 100),
      offset: Number(req.query.offset || 0),
    }),
  });
});

app.get('/api/admin/mail-outbox', requireAdmin, (_req, res) => {
  res.json({ mails: listMailOutbox(80) });
});

app.get('/api/admin/smtp', requireAdmin, (_req, res) => {
  res.json({ smtp: smtpPublicConfig(), env: getAppEnv(), appUrl: process.env.APP_URL || null });
});

app.post('/api/admin/smtp/test', requireAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || req.user?.email || '').trim();
    const result = await testSmtp(to || undefined);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
});

app.post('/api/admin/build', requireAdmin, (_req, res) => {
  res.json(startBuild());
});

app.get('/api/admin/build', requireAdmin, (_req, res) => {
  res.json(getBuildJob());
});

// Deploy info also available lightly for logged-in users (QR on profile) — LAN URLs only
app.get('/api/deploy/info', accountRequired, (_req, res) => {
  const info = deployInfo(PORT);
  res.json({
    urls: info.urls,
    lan: info.lan,
    port: info.port,
    built: info.built,
  });
});

app.get('/api/home', accountRequired, async (req, res) => {
  try {
    const personal: Awaited<ReturnType<typeof getHome>> = [];
    const reco = await homeReco(req.userId!);
    personal.push(...(reco.shelves as Awaited<ReturnType<typeof getHome>>));

    const history = getHistory(req.userId!, 40);
    const top = getTopListened(req.userId!, 25);
    const likedPl = getFullLibrary(req.userId!).likedPlaylists || [];
    const localPl = listPlaylists(req.userId!);

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

    if (top[0] && /^[a-zA-Z0-9_-]{11}$/.test(top[0].id)) {
      try {
        const sim = await similarForUser(req.userId!, top[0].id, top[0]);
        if (sim.tracks.length) {
          personal.push({ title: 'Rapide · pour toi', items: sim.tracks.slice(0, 20) });
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

    res.json({
      shelves,
      seeds,
      hasMore: true,
      page: 0,
      needsOnboarding: reco.needsOnboarding,
      radios: reco.radios,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/home/more', accountRequired, async (req, res) => {
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

app.get('/api/explore', accountRequired, async (req, res) => {
  try {
    const yt = await getExplore();
    const reco = await exploreReco(req.userId!);
    const radioShelves = reco.radios
      .filter((r) => r.items.length)
      .map((r) => ({ title: `Radio · ${r.title}`, items: r.items }));
    res.json({
      shelves: [...radioShelves, ...yt],
      needsOnboarding: reco.needsOnboarding,
      radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search', accountRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.status(400).json({ error: 'query requise' });
      return;
    }
    addSearchHistory(req.userId!, q);
    res.json(await search(q, String(req.query.filter || 'all')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search/suggestions', accountRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const yt = q ? await searchSuggestions(q) : [];
    res.json({ suggestions: suggestSearch(req.userId!, q, yt) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search/history', accountRequired, (req, res) => {
  res.json({ history: listSearchHistory(req.userId!, 40) });
});

app.post('/api/search/history', accountRequired, (req, res) => {
  const q = String(req.body?.query || '').trim();
  if (!q) {
    res.status(400).json({ error: 'query requise' });
    return;
  }
  addSearchHistory(req.userId!, q, {
    id: req.body?.clickedId,
    kind: req.body?.clickedKind,
  });
  res.json({ ok: true, history: listSearchHistory(req.userId!, 40) });
});

app.get('/api/track/:id', accountRequired, async (req, res) => {
  try {
    const { track } = await getTrack(p(req.params.id));
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

app.post('/api/history', accountRequired, (req, res) => {
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

app.get('/api/history', accountRequired, (req, res) => {
  res.json({ history: getHistory(req.userId!, 500) });
});

app.get('/api/history/detailed', accountRequired, (req, res) => {
  res.json({ events: listListenEvents(req.userId!, 500) });
});

app.post('/api/listen', accountRequired, (req, res) => {
  try {
    const event = String(req.body?.event || 'start') as 'start' | 'progress' | 'complete' | 'skip';
    const trackId = String(req.body?.trackId || '');
    if (!trackId) {
      res.status(400).json({ error: 'trackId requis' });
      return;
    }
    recordListenEvent({
      userId: req.userId!,
      trackId,
      event,
      progressPct: Number(req.body?.progressPct || 0),
      durationMs: req.body?.durationMs != null ? Number(req.body.durationMs) : undefined,
      seedId: req.body?.seedId ? String(req.body.seedId) : undefined,
    });
    if (event === 'start' || event === 'complete') {
      const track = req.body?.track as Track | undefined;
      if (track?.id) addHistory(req.userId!, track);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/prefs', accountRequired, (req, res) => {
  res.json({
    prefs: getPrefs(req.userId!),
    follows: listFollows(req.userId!),
  });
});

app.put('/api/prefs', accountRequired, (req, res) => {
  const prefs = savePrefs(req.userId!, {
    genres: Array.isArray(req.body?.genres) ? req.body.genres.map(String) : undefined,
    moods: Array.isArray(req.body?.moods) ? req.body.moods.map(String) : undefined,
    moments: Array.isArray(req.body?.moments) ? req.body.moments.map(String) : undefined,
    discoveryBias:
      req.body?.discoveryBias != null ? Number(req.body.discoveryBias) : undefined,
    onboardingDone:
      req.body?.onboardingDone != null ? Boolean(req.body.onboardingDone) : undefined,
  });
  res.json({ prefs });
});

app.post('/api/prefs/onboarding', accountRequired, (req, res) => {
  const prefs = savePrefs(req.userId!, {
    genres: Array.isArray(req.body?.genres) ? req.body.genres.map(String) : [],
    moods: Array.isArray(req.body?.moods) ? req.body.moods.map(String) : [],
    moments: Array.isArray(req.body?.moments) ? req.body.moments.map(String) : [],
    discoveryBias:
      req.body?.discoveryBias != null ? Number(req.body.discoveryBias) : 0.15,
    onboardingDone: true,
  });
  const artists = Array.isArray(req.body?.artists) ? req.body.artists : [];
  for (const a of artists) {
    if (a?.id) followArtist(req.userId!, { id: String(a.id), name: a.name, payload: a });
  }
  res.json({ prefs, follows: listFollows(req.userId!) });
});

app.get('/api/pins', accountRequired, (req, res) => {
  res.json({ pins: listPins(req.userId!) });
});

app.post('/api/pins', accountRequired, (req, res) => {
  const kind = String(req.body?.kind || 'song');
  const targetId = String(req.body?.targetId || req.body?.id || '');
  if (!targetId) {
    res.status(400).json({ error: 'targetId requis' });
    return;
  }
  const pins = addPin(req.userId!, kind, targetId, req.body?.payload || req.body);
  res.json({ pins });
});

app.delete('/api/pins/:id', accountRequired, (req, res) => {
  res.json({ pins: removePin(req.userId!, p(req.params.id)) });
});

app.post('/api/artists/:id/follow', accountRequired, (req, res) => {
  followArtist(req.userId!, {
    id: p(req.params.id),
    name: req.body?.name,
    payload: req.body,
  });
  res.json({ ok: true, follows: listFollows(req.userId!) });
});

app.delete('/api/artists/:id/follow', accountRequired, (req, res) => {
  unfollowArtist(req.userId!, p(req.params.id));
  res.json({ ok: true, follows: listFollows(req.userId!) });
});

app.get('/api/reco/home', accountRequired, async (req, res) => {
  try {
    res.json(await homeReco(req.userId!));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/reco/explore', accountRequired, async (req, res) => {
  try {
    res.json(await exploreReco(req.userId!));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/reco/similar/:trackId', accountRequired, async (req, res) => {
  try {
    res.json(await similarForUser(req.userId!, p(req.params.trackId)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/reco/radio/:category', accountRequired, async (req, res) => {
  try {
    res.json(await radioForUser(req.userId!, p(req.params.category)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/reco/radios', accountRequired, (_req, res) => {
  res.json({ radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title })) });
});

app.post('/api/reco/feedback', accountRequired, (req, res) => {
  const trackId = String(req.body?.trackId || '');
  const verdict = String(req.body?.verdict || '') as 'good' | 'bad';
  if (!trackId || (verdict !== 'good' && verdict !== 'bad')) {
    res.status(400).json({ error: 'trackId et verdict (good|bad) requis' });
    return;
  }
  addRecoFeedback({
    userId: req.userId!,
    trackId,
    seedId: req.body?.seedId ? String(req.body.seedId) : undefined,
    verdict,
    context: req.body?.context ? String(req.body.context) : undefined,
  });
  res.json({ ok: true });
});

app.get('/api/admin/reco', requireAdmin, (_req, res) => {
  res.json(recoAdminStats());
});

app.put('/api/admin/reco/weights', requireAdmin, (req, res) => {
  const mode = String(req.body?.mode || 'radio');
  const w = saveWeights(mode, {
    w_content: Number(req.body?.w_content ?? 0.35),
    w_seq: Number(req.body?.w_seq ?? 0.25),
    w_ctx: Number(req.body?.w_ctx ?? 0.2),
    w_bandit: Number(req.body?.w_bandit ?? 0.1),
    w_satisf: Number(req.body?.w_satisf ?? 0.1),
  });
  res.json({ weights: w, all: listWeights() });
});

app.get('/api/track/:id/upnext', accountRequired, async (req, res) => {
  try {
    const tracks = await getUpNext(p(req.params.id));
    const ranked = await similarForUser(req.userId!, p(req.params.id));
    res.json({ tracks: ranked.tracks.length ? ranked.tracks : tracks });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/track/:id/related', accountRequired, async (req, res) => {
  try {
    const sim = await similarForUser(req.userId!, p(req.params.id));
    res.json({
      related: sim.tracks.length ? sim.tracks : sim.related,
      radio: sim.tracks.length ? sim.tracks : sim.radio,
      rawRelated: sim.related,
      rawRadio: sim.radio,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/track/:id/lyrics', async (req, res) => {
  try {
    res.json(await getLyrics(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id', async (req, res) => {
  try {
    res.json(await getArtist(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id/radio', async (req, res) => {
  try {
    res.json({ tracks: await getArtistRadio(p(req.params.id)) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id', async (req, res) => {
  try {
    res.json(await getAlbum(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id/radio', async (req, res) => {
  try {
    res.json({ tracks: await getAlbumRadio(p(req.params.id)) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/playlist/:id', async (req, res) => {
  try {
    res.json(await getPlaylist(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/stream/:id', (req, res) => {
  void handleStream(req, res);
});

app.post('/api/download/:id', accountRequired, async (req, res) => {
  try {
    const id = p(req.params.id);
    const path = await downloadTrack(id);
    markDownloaded(req.userId!, id, path);
    res.json({ ok: true, path, streamUrl: `/api/stream/${id}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/library', accountRequired, (req, res) => {
  res.json(getFullLibrary(req.userId!));
});

app.post('/api/library/like', accountRequired, (req, res) => {
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

app.post('/api/library/like-playlist', accountRequired, (req, res) => {
  try {
    res.json({
      ...toggleLikePlaylist(req.userId!, req.body),
      library: getFullLibrary(req.userId!),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/library/albums', accountRequired, (req, res) => {
  try {
    res.json({ album: saveAlbum(req.userId!, req.body), library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/albums/:id', accountRequired, (req, res) => {
  removeAlbum(req.userId!, p(req.params.id));
  res.json({ ok: true, library: getFullLibrary(req.userId!) });
});

app.post('/api/library/artists', accountRequired, (req, res) => {
  try {
    res.json({ artist: saveArtist(req.userId!, req.body), library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/artists/:id', accountRequired, (req, res) => {
  removeArtist(req.userId!, p(req.params.id));
  res.json({ ok: true, library: getFullLibrary(req.userId!) });
});

app.post('/api/library/playlists', accountRequired, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim() || 'Nouvelle playlist';
    res.json(createPlaylist(req.userId!, name, String(req.body?.description || '')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/library/playlists/:id', accountRequired, (req, res) => {
  try {
    res.json(updatePlaylist(req.userId!, p(req.params.id), req.body || {}));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/playlists/:id', accountRequired, (req, res) => {
  try {
    deletePlaylist(req.userId!, p(req.params.id));
    res.json({ ok: true, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/library/playlists/:id/tracks', accountRequired, (req, res) => {
  try {
    res.json(addToPlaylist(req.userId!, p(req.params.id), req.body as Track));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/playlists/:id/tracks/:trackId', accountRequired, (req, res) => {
  try {
    res.json(removeFromPlaylist(req.userId!, p(req.params.id), p(req.params.trackId)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/library/playlists/:id/reorder', accountRequired, (req, res) => {
  try {
    res.json(reorderPlaylist(req.userId!, p(req.params.id), (req.body?.trackIds || []) as string[]));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/import', accountRequired, async (req, res) => {
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

app.get('/api/ytm/status', authRequired, (req, res) => {
  if (req.user?.isGuest) {
    res.status(400).json({ error: 'Crée un compte pour lier YouTube Music' });
    return;
  }
  res.json({
    account: getYtmAccountPublic(req.userId!),
    oauth: getYtmOauthStatus(req.userId!),
  });
});

app.post('/api/ytm/connect/cookie', authRequired, (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Crée un compte pour lier YouTube Music' });
      return;
    }
    clearYtmSession(req.userId!);
    saveYtmCookie(req.userId!, String(req.body?.cookie || ''));
    res.json({ ok: true, account: getYtmAccountPublic(req.userId!) });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/ytm/connect/oauth', authRequired, async (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Crée un compte pour lier YouTube Music' });
      return;
    }
    const started = await startYtmDeviceOauth(req.userId!);
    res.json({ ok: true, ...started });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.get('/api/ytm/oauth/status', authRequired, (req, res) => {
  res.json(getYtmOauthStatus(req.userId!));
});

app.post('/api/ytm/sync', authRequired, async (req, res) => {
  try {
    if (req.user?.isGuest) {
      res.status(400).json({ error: 'Crée un compte pour synchroniser' });
      return;
    }
    const result = await syncYtmLibrary(req.userId!);
    res.json({
      ok: true,
      stats: result.stats,
      library: result.library,
      account: getYtmAccountPublic(req.userId!),
    });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.delete('/api/ytm/disconnect', authRequired, (req, res) => {
  clearYtmSession(req.userId!);
  disconnectYtm(req.userId!);
  res.json({ ok: true, account: getYtmAccountPublic(req.userId!) });
});

app.get('/api/offline', accountRequired, handleOfflineStatus);
app.get('/api/offline/downloads', accountRequired, (req, res) => {
  res.json({ downloads: listDownloads(req.userId!) });
});
app.post('/api/offline/start', accountRequired, async (req, res) => {
  try {
    const kind = String(req.body?.kind || 'playlist') as 'album' | 'playlist' | 'artist' | 'liked';
    const targetId = String(req.body?.targetId || 'liked');
    res.json(await startOfflineCollection(req.userId!, kind, targetId));
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message || err) });
  }
});

app.get('/api/session', accountRequired, (req, res) => {
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
