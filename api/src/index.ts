import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
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
  getArtistSongs,
  getMoodCategory,
  resetYT,
} from './yt.js';
import {
  getFullLibrary,
  toggleLikeTrack,
  toggleLibraryTrack,
  removeLibraryTrack,
  isTrackInLibrary,
  toggleLikePlaylist,
  saveAlbum,
  removeAlbum,
  saveMix,
  removeMix,
  isMixSaved,
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
  recordEntityPlay,
  getEntityHistory,
  listDownloads,
  markDownloaded,
  listPlaylists,
} from './library.js';
import { handleStream, handleStreamUrl, handleStreamWarm, downloadTrack, cachePath, resolveStreamUpstream } from './stream.js';
import { importByKind, importByQueryOrUrl } from './import.js';
import { handleOfflineStatus, startOfflineCollection } from './offline.js';
import { handleImageProxy } from './img.js';
import {
  deployInfo,
  getApkJob,
  getApkPath,
  getBuildJob,
  publishApkBuffer,
  startApkBuild,
  startBuild,
} from './admin.js';
import {
  deployAdminHints,
  getDeployJob,
  startAdminDeploy,
  type DeployMode,
} from './deployRemote.js';
import {
  clearYoutubeCookieHeader,
  saveYoutubeCookieHeader,
  youtubeCookiesStatus,
} from './youtubeCookies.js';
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
  authAllowGuest,
  authConfig,
  authOptional,
  authRequired,
  issueSession,
  loginGoogle,
  loginLocal,
  registerLocal,
  sessionCookieOptions,
  signToken,
  syncSeedCredentials,
  verifyToken,
} from './auth.js';
import { rateLimit } from './rateLimit.js';
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
  removePinByTarget,
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
  createEmailToken,
  insertTelemetry,
  listMailOutbox,
  listTelemetry,
  markEmailVerified,
  redeemEmailToken,
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
import { detachSocket, getHubPublic, handleSessionMessage, publishPlaybackState, touchHttpDevice, setActiveDeviceHttp, transferPlaybackHttp } from './sessions.js';
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

/** CORS : allowlist (APP_URL + CORS_ORIGINS) ; en local, LAN privée OK. */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin, curl, apps natives
  const env = process.env.APP_ENV || 'local';
  const allow = new Set(
    [
      ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
      (process.env.APP_URL || '').replace(/\/$/, ''),
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8787',
      'http://127.0.0.1:8787',
    ].filter(Boolean),
  );
  if (allow.has(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (env === 'local' || env === 'development') {
    return /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
      origin,
    );
  }
  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  }),
);
/** Upload APK binaire — avant express.json pour ne pas consommer le flux. */
app.use('/api/admin/apk/upload', express.raw({ type: () => true, limit: '120mb' }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(authOptional);

const authBurst = rateLimit({ windowMs: 60_000, max: 20 });
const authStrict = rateLimit({ windowMs: 15 * 60_000, max: 40 });

app.get('/api/health', (_req, res) => {
  const ytCookies = youtubeCookiesStatus();
  const ref = process.env.BUILD_REF || 'local';
  let semver = (process.env.APP_VERSION || '').trim();
  if (!semver) {
    try {
      semver = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    } catch {
      semver = process.env.npm_package_version || '0.0.0';
    }
  }
  const channel = ref === 'prod' || process.env.APP_ENV === 'production' ? 'p' : 'd';
  res.json({
    ok: true,
    version: process.env.BUILD_SHA || semver || 'dev',
    appVersion: `${channel}+${semver}`,
    ref,
    ytdlp: existsSync(join(ROOT, 'bin', 'yt-dlp')),
    auth: authConfig(),
    youtubeCookies: {
      configured: ytCookies.configured,
      source: ytCookies.source,
      hint: ytCookies.hint,
    },
    streamUpstream: resolveStreamUpstream(),
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

app.post('/api/auth/register', authBurst, authStrict, async (req, res) => {
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

app.post('/api/auth/login', authBurst, authStrict, async (req, res) => {
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

app.post('/api/auth/google', authBurst, authStrict, async (req, res) => {
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

app.post('/api/auth/refresh', authBurst, async (req, res) => {
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
  const opts = sessionCookieOptions();
  res.clearCookie('ytm_token', { path: opts.path, sameSite: opts.sameSite, secure: opts.secure });
  res.clearCookie('ytm_refresh', { path: opts.path, sameSite: opts.sameSite, secure: opts.secure });
  res.json({ ok: true });
});

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const token = String(req.body?.token || req.query?.token || '').trim();
    const result = redeemEmailToken(token, 'verify');
    if (!result.ok) {
      const msg =
        result.reason === 'expired'
          ? 'Lien expiré — demande un nouvel email de validation'
          : result.reason === 'missing'
            ? 'Lien invalide — jeton manquant'
            : 'Lien invalide ou déjà remplacé — demande un nouvel email de validation';
      res.status(400).json({ error: msg, reason: result.reason });
      return;
    }
    markEmailVerified(result.userId);
    const user = findUserById(result.userId)!;
    res.json({
      ok: true,
      already: result.already,
      user: publicUser(user),
      message: result.already ? 'Email déjà validé' : 'Email validé',
    });
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

/**
 * Landing email — NE consomme PAS le token (anti SafeLinks / prefetch).
 * Le navigateur / mobile POST ensuite vers /api/auth/verify-email.
 */
app.get('/verify-email', (req, res) => {
  const token = String(req.query.token || '').trim();
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const tokenJs = JSON.stringify(token);

  if (!token) {
    res.status(400).type('html').send(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Lien invalide — YTMusic</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#030303;color:#fff}
.card{max-width:420px;margin:24px;padding:28px;border-radius:16px;border:1px solid #222;background:#121212}
.err{color:#f87171}a{color:#ff0033}</style></head>
<body><div class="card"><h1 class="err">Lien invalide</h1><p>Aucun jeton dans l’URL.</p>
<p><a href="/">Retour YTMusic</a></p></div></body></html>`);
    return;
  }

  res.type('html').send(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Validation email — YTMusic</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,sans-serif;background:#030303;color:#fff}
  .card{max-width:420px;margin:24px;padding:28px;border-radius:16px;border:1px solid #222;background:#121212;text-align:center}
  h1{margin:0 0 12px;font-size:1.35rem}
  p{color:#aaa;line-height:1.5}
  .ok{color:#34d399} .err{color:#f87171} .muted{color:#888;font-size:13px}
  button{margin-top:16px;background:#ff0033;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  a{color:#ff0033}
</style></head><body><div class="card">
  <h1 id="title">Validation…</h1>
  <p id="msg">Confirmation de ton adresse email.</p>
  <button id="btn" type="button" style="display:none">Valider mon email</button>
  <p class="muted" id="hint"></p>
  <p style="margin-top:20px"><a href="/">Retour YTMusic</a></p>
</div>
<script>
(function () {
  var token = ${tokenJs};
  var title = document.getElementById('title');
  var msg = document.getElementById('msg');
  var btn = document.getElementById('btn');
  var hint = document.getElementById('hint');
  var once = false;
  function show(ok, t, m) {
    title.className = ok ? 'ok' : 'err';
    title.textContent = t;
    msg.innerHTML = m;
  }
  async function verify() {
    if (once) return;
    once = true;
    btn.disabled = true;
    try {
      var r = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token }),
        credentials: 'same-origin'
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        once = false;
        btn.style.display = 'inline-block';
        btn.disabled = false;
        show(false, 'Échec', (j && j.error) ? j.error : ('Erreur HTTP ' + r.status));
        hint.textContent = 'Tu peux réessayer ou demander un nouvel email depuis l’app.';
        return;
      }
      var email = (j.user && j.user.email) ? j.user.email : '';
      show(true, j.already ? 'Déjà validé' : 'Email validé',
        email ? ('Compte <strong style="color:#fff">' + email + '</strong> confirmé. Tu peux revenir dans l’app.') : 'Tu peux revenir dans l’app web ou Android.');
      btn.style.display = 'none';
      hint.textContent = '';
    } catch (e) {
      once = false;
      btn.style.display = 'inline-block';
      btn.disabled = false;
      show(false, 'Erreur réseau', String(e && e.message || e));
    }
  }
  btn.addEventListener('click', verify);
  // Auto-POST (pas sur GET) — SafeLinks ne consomme plus le jeton
  verify();
})();
</script></body></html>`);
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
    const { appUrl } = await import('./mail.js');
    const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(raw)}`;
    const env = process.env.APP_ENV || 'local';
    res.json({
      ok: true,
      ...(env !== 'production' ? { verifyUrl, verifyToken: raw } : {}),
    });
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

/** Digital Asset Links — Passkeys / Credential Manager Android */
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const fps = (process.env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fingerprints =
    fps.length > 0
      ? fps
      : ['3C:F6:C5:32:1D:A1:51:7E:79:94:0C:9E:25:51:4A:63:9B:2C:44:9E:3E:FF:7D:F7:47:68:76:CB:F6:F4:C1:1F'];
  res.json([
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: process.env.ANDROID_PACKAGE_NAME || 'ovh.delhomme.ytmusic',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
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
    const rawOrigin = String(req.headers.origin || getOrigin(host, proto));
    const origin = rawOrigin;
    const rpID = rawOrigin.startsWith('android:')
      ? getRpID(host)
      : getRpID(new URL(rawOrigin).hostname);
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
    const rpID = origin.startsWith('android:')
      ? getRpID(req.hostname)
      : origin
        ? getRpID(new URL(origin).hostname)
        : getRpID(req.hostname);
    const options = await beginAuthentication(rpID, req.body?.email ? String(req.body.email) : undefined);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message || err) });
  }
});

app.post('/api/auth/passkeys/login/verify', async (req, res) => {
  try {
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || req.hostname);
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
    const rawOrigin = String(req.headers.origin || getOrigin(host, proto));
    const rpID = rawOrigin.startsWith('android:')
      ? getRpID(host)
      : getRpID(new URL(rawOrigin).hostname);
    const userId = await finishAuthentication(req.body?.credential || req.body, rpID, rawOrigin);
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
  res.json({
    ...deployInfo(PORT),
    env: getAppEnv(),
    telemetry: telemetryStats(),
    deploy: deployAdminHints(),
    youtubeCookies: youtubeCookiesStatus(),
  });
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

/** Compile + publie l’APK (SDK Android requis sur la machine API). body.target = auto|lan|app_url|URL */
app.post('/api/admin/apk/build', requireAdmin, (req, res) => {
  const target = String(req.body?.target || 'auto').trim() || 'auto';
  res.json(startApkBuild(target, PORT));
});

/**
 * Upload d’une APK déjà compilée (idéal Portainer : pas de SDK dans le conteneur).
 * Body brut = octets APK. Headers optionnels : X-Apk-Api-Base-Url, X-Apk-Version-Name.
 */
app.post('/api/admin/apk/upload', requireAdmin, (req, res) => {
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    const apiBaseUrl = String(
      req.headers['x-apk-api-base-url'] ||
        process.env.ANDROID_API_BASE_URL ||
        process.env.APP_URL ||
        `https://ytmusic.delhomme.ovh`,
    )
      .trim()
      .replace(/\/$/, '');
    const versionName = String(req.headers['x-apk-version-name'] || '').trim() || undefined;
    const versionCode = Number(req.headers['x-apk-version-code'] || 0) || undefined;
    const published = publishApkBuffer(buf, { apiBaseUrl, versionName, versionCode });
    res.json({ ok: true, ...published, apk: getApkJob() });
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
});

app.get('/api/admin/apk', requireAdmin, (_req, res) => {
  res.json(getApkJob());
});

/** Mise en prod depuis Admin local : web (git→GHCR→redeploy CE) / apk / all */
app.get('/api/admin/deploy', requireAdmin, (_req, res) => {
  res.json(deployAdminHints());
});

app.post('/api/admin/deploy', requireAdmin, (req, res) => {
  try {
    const mode = String(req.body?.mode || 'web').trim() as DeployMode;
    res.json(startAdminDeploy(mode));
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err as Error).message || err), job: getDeployJob() });
  }
});

/** Cookies YouTube (anti-bot VPS) — header Cookie depuis DevTools. */
app.get('/api/admin/youtube-cookies', requireAdmin, (_req, res) => {
  res.json(youtubeCookiesStatus());
});

app.post('/api/admin/youtube-cookies', requireAdmin, (req, res) => {
  try {
    const cookie = String(req.body?.cookie || req.body?.cookies || '');
    const status = saveYoutubeCookieHeader(cookie);
    resetYT();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
});

app.delete('/api/admin/youtube-cookies', requireAdmin, (_req, res) => {
  const status = clearYoutubeCookieHeader();
  resetYT();
  res.json({ ok: true, ...status });
});

function apkDownloadAuthorized(req: import('express').Request) {
  const secret = (process.env.APK_DOWNLOAD_TOKEN || '').trim();
  if (!secret) return true; // pas de secret = lien public (QR Admin)
  const q = typeof req.query?.key === 'string' ? req.query.key : '';
  const header = String(req.headers['x-apk-token'] || '');
  return q === secret || header === secret;
}

/** Téléchargement APK (QR). Optionnel : APK_DOWNLOAD_TOKEN → ?key=… */
app.get('/api/deploy/apk', (req, res) => {
  if (!apkDownloadAuthorized(req)) {
    res.status(401).json({ error: 'Lien APK protégé — clé manquante ou invalide' });
    return;
  }
  const path = getApkPath();
  if (!path) {
    res.status(404).json({
      error: 'APK non publiée',
      hint: 'Admin → Déploiement mobile → Uploader l’APK, ou make android-upload-apk',
    });
    return;
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="ytmusic.apk"');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path);
});

app.get('/api/deploy/apk/info', (req, res) => {
  if (!apkDownloadAuthorized(req)) {
    res.status(401).json({ error: 'Lien APK protégé — clé manquante ou invalide' });
    return;
  }
  const info = deployInfo(PORT).apk;
  res.json({
    ready: info.ready,
    versionName: info.versionName,
    versionCode: info.versionCode,
    apiBaseUrl: info.apiBaseUrl,
    builtAt: info.builtAt,
    sizeBytes: info.sizeBytes,
    downloadPath: info.downloadPath,
  });
});

// Deploy info also available lightly for logged-in users (QR on profile) — LAN URLs only
app.get('/api/deploy/info', accountRequired, (_req, res) => {
  const info = deployInfo(PORT);
  res.json({
    urls: info.urls,
    lan: info.lan,
    port: info.port,
    built: info.built,
    apk: {
      ready: info.apk.ready,
      downloadUrl: info.apk.downloadUrl,
      apiBaseUrl: info.apk.apiBaseUrl,
      versionName: info.apk.versionName,
    },
  });
});

app.get('/api/home', accountRequired, async (req, res) => {
  try {
    const userId = req.userId!;
    const history = getHistory(userId, 40);
    const top = getTopListened(userId, 25);
    const likedPl = getFullLibrary(userId).likedPlaylists || [];
    const localPl = listPlaylists(userId);

    // reco perso + home YT + similar en parallèle (gros gain cold start)
    const similarPromise =
      top[0] && /^[a-zA-Z0-9_-]{11}$/.test(top[0].id)
        ? similarForUser(userId, top[0].id, top[0]).catch(() => null)
        : Promise.resolve(null);

    const [reco, ytHome, sim] = await Promise.all([homeReco(userId), getHome(), similarPromise]);

    const personal: Awaited<ReturnType<typeof getHome>> = [
      ...(reco.shelves as Awaited<ReturnType<typeof getHome>>),
    ];

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

    if (sim?.tracks?.length) {
      personal.push({ title: 'Rapide · pour toi', items: sim.tracks.slice(0, 20) });
    }

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
    // Léger : YT Explore seulement. Les radios se chargent une par une côté client.
    const yt = await getExplore().catch(() => [] as Awaited<ReturnType<typeof getExplore>>);
    const prefs = getPrefs(req.userId!);
    res.json({
      shelves: yt,
      needsOnboarding: !prefs.onboardingDone,
      radios: RADIO_CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/mood/:id', accountRequired, async (req, res) => {
  try {
    const id = decodeURIComponent(p(req.params.id));
    const title = typeof req.query.title === 'string' ? req.query.title : '';
    res.json(await getMoodCategory(id, title));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/search', accountRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().replace(/\s+/g, ' ');
    if (!q) {
      res.status(400).json({ error: 'query requise' });
      return;
    }
    const noHistory =
      req.query.noHistory === '1' ||
      req.query.noHistory === 'true' ||
      String(req.query.source || '') === 'prefs' ||
      // Frappe live / très courte : ne pas polluer l’historique
      q.length < 3;
    if (!noHistory) addSearchHistory(req.userId!, q);
    res.json(await search(q, String(req.query.filter || 'all'), { userId: req.userId! }));
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
    const body = req.body || {};
    const track = (body.track && typeof body.track === 'object' ? body.track : body) as Track;
    const id = String(track?.id || body.videoId || body.trackId || body.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'track requis' });
      return;
    }
    addHistory(req.userId!, { ...track, id }, { bumpCount: false });
    res.json({ ok: true, history: getHistory(req.userId!, 500) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/history', accountRequired, (req, res) => {
  const kind = req.query?.kind ? String(req.query.kind) : undefined;
  if (kind === 'playlist' || kind === 'album' || kind === 'artist' || kind === 'mix') {
    res.json({ entities: getEntityHistory(req.userId!, 40, kind) });
    return;
  }
  res.json({
    history: getHistory(req.userId!, 500),
    entities: getEntityHistory(req.userId!, 40),
  });
});

app.post('/api/history/entity', accountRequired, (req, res) => {
  try {
    const kind = String(req.body?.kind || '') as 'playlist' | 'album' | 'artist' | 'mix';
    const id = String(req.body?.id || '').trim();
    if (!id || !['playlist', 'album', 'artist', 'mix'].includes(kind)) {
      res.status(400).json({ error: 'id et kind (playlist|album|artist|mix) requis' });
      return;
    }
    recordEntityPlay(req.userId!, {
      id,
      kind,
      title: req.body?.title || req.body?.name,
      name: req.body?.name,
      thumbnails: req.body?.thumbnails,
      artists: req.body?.artists,
      type: req.body?.type || kind,
      covers: req.body?.covers,
    });
    res.json({ ok: true, entities: getEntityHistory(req.userId!, 40) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
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
      const track = (req.body?.track as Track | undefined) || {
        id: trackId,
        title: trackId,
        artists: [],
        thumbnails: [],
        type: 'song' as const,
      };
      // start = remonter dans « récemment » ; complete = incrémenter le compteur
      addHistory(req.userId!, track, { bumpCount: event === 'complete' });
    }
    const ctx = req.body?.context;
    if (ctx?.id && ctx?.kind && (event === 'start' || event === 'complete')) {
      recordEntityPlay(req.userId!, {
        id: String(ctx.id),
        kind: String(ctx.kind) as 'playlist' | 'album' | 'artist' | 'mix',
        title: ctx.title || ctx.name,
        name: ctx.name,
        thumbnails: ctx.thumbnails,
        artists: ctx.artists,
        type: ctx.type,
        covers: ctx.covers,
      });
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
  const id = p(req.params.id);
  const byId = listPins(req.userId!).find((x) => x.id === id);
  if (byId) {
    res.json({ pins: removePin(req.userId!, id) });
    return;
  }
  res.json({ pins: removePinByTarget(req.userId!, id) });
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
    const light =
      req.query.preview === '1' ||
      req.query.preview === 'true' ||
      req.query.light === '1' ||
      req.query.light === 'true';
    res.json(await radioForUser(req.userId!, p(req.params.category), { light }));
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

app.get('/api/track/:id/lyrics', accountRequired, async (req, res) => {
  try {
    res.json(await getLyrics(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id', accountRequired, async (req, res) => {
  try {
    res.json(await getArtist(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id/radio', accountRequired, async (req, res) => {
  try {
    res.json({ tracks: await getArtistRadio(p(req.params.id)) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/artist/:id/songs', accountRequired, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    res.json(await getArtistSongs(p(req.params.id), { limit }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id', accountRequired, async (req, res) => {
  try {
    res.json(await getAlbum(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/album/:id/radio', accountRequired, async (req, res) => {
  try {
    res.json({ tracks: await getAlbumRadio(p(req.params.id)) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/playlist/:id', accountRequired, async (req, res) => {
  try {
    res.json(await getPlaylist(p(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/stream/:id/url', authRequired, (req, res) => {
  void handleStreamUrl(req, res);
});

app.post('/api/stream/warm', accountRequired, (req, res) => {
  void handleStreamWarm(req, res);
});

app.get('/api/stream/:id', authRequired, (req, res) => {
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

/** Enregistrer / retirer un titre de la biblio (sans toucher aux J’aime). */
app.post('/api/library/songs', accountRequired, (req, res) => {
  try {
    const track = req.body as Track;
    if (!track?.id) {
      res.status(400).json({ error: 'track requis' });
      return;
    }
    const result = toggleLibraryTrack(req.userId!, track);
    res.json({ ...result, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/songs/:id', accountRequired, (req, res) => {
  removeLibraryTrack(req.userId!, p(req.params.id));
  res.json({ ok: true, saved: false, library: getFullLibrary(req.userId!) });
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

app.post('/api/library/mixes', accountRequired, async (req, res) => {
  try {
    const id = String(req.body?.id || '').trim();
    const title = String(req.body?.title || 'Mix').trim() || 'Mix';
    let tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    let covers = Array.isArray(req.body?.covers) ? req.body.covers : [];
    if (!tracks.length && id) {
      const mix = await radioForUser(req.userId!, id, { light: true });
      tracks = mix.tracks || [];
    }
    if (!covers.length) covers = tracks.slice(0, 4);
    const saved = saveMix(req.userId!, { id, title, tracks, covers });
    res.json({ mix: saved, saved: true, library: getFullLibrary(req.userId!) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/library/mixes/:id', accountRequired, (req, res) => {
  removeMix(req.userId!, p(req.params.id));
  res.json({ ok: true, library: getFullLibrary(req.userId!) });
});

app.get('/api/library/mixes/:id/saved', accountRequired, (req, res) => {
  res.json({ saved: isMixSaved(req.userId!, p(req.params.id)) });
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
  const deviceId = String(req.headers['x-device-id'] || '');
  if (deviceId) {
    touchHttpDevice(req.userId!, {
      id: deviceId,
      name: String(req.headers['x-device-name'] || 'Android'),
      type: 'mobile',
      canPlay: true,
    });
  }
  res.json(getHubPublic(req.userId!));
});

app.post('/api/session/device', accountRequired, (req, res) => {
  const id = String(req.body?.deviceId || req.headers['x-device-id'] || '');
  res.json(
    touchHttpDevice(req.userId!, {
      id,
      name: String(req.body?.name || req.headers['x-device-name'] || 'Appareil'),
      type: (req.body?.deviceType || 'mobile') as 'web' | 'mobile' | 'desktop' | 'tv',
      canPlay: req.body?.canPlay !== false,
    }),
  );
});

app.post('/api/session/active', accountRequired, (req, res) => {
  const targetId = String(req.body?.targetId || '');
  res.json(setActiveDeviceHttp(req.userId!, targetId));
});

app.post('/api/session/transfer', accountRequired, (req, res) => {
  const targetId = String(req.body?.targetId || '');
  res.json(transferPlaybackHttp(req.userId!, targetId, req.body?.state || undefined));
});

app.put('/api/session/state', accountRequired, (req, res) => {
  try {
    const deviceId = String(req.headers['x-device-id'] || req.body?.deviceId || '');
    if (deviceId) {
      touchHttpDevice(req.userId!, {
        id: deviceId,
        name: String(req.headers['x-device-name'] || req.body?.deviceName || 'Appareil'),
        type: 'mobile',
        canPlay: true,
      });
    }
    res.json(
      publishPlaybackState(req.userId!, req.body || {}, {
        deviceId,
        force: Boolean(req.body?.force || req.query.force),
      }),
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const clientDist = join(ROOT, 'web', 'dist');
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
      /* fallthrough */
    }
  }

  if (!authAllowGuest()) {
    throw new Error('Authentification requise');
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
    try {
      const { userId, name } = await resolveWsUser(req);
      ws.on('message', (data) => {
        handleSessionMessage(userId, ws, String(data), { defaultName: name });
      });
      ws.on('close', () => detachSocket(ws));
      ws.on('error', () => detachSocket(ws));
      ws.send(JSON.stringify({ type: 'hello', userId }));
    } catch {
      ws.close(4401, 'auth required');
    }
  })();
});

server.listen(PORT, '0.0.0.0', () => {
  try {
    syncSeedCredentials();
  } catch (err) {
    console.error('[auth] seed sync', err);
  }
  console.log(`YTMusic API → http://localhost:${PORT}`);
  console.log(`YTMusic LAN → http://0.0.0.0:${PORT} (toutes interfaces)`);
  console.log(`YTMusic WS  → ws://localhost:${PORT}/ws`);
});
