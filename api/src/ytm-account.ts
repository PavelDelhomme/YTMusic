import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

const ALGO = 'aes-256-gcm';

function keyFromSecret() {
  return createHash('sha256')
    .update(process.env.JWT_SECRET || 'ytmusic-dev-secret-change-me')
    .digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyFromSecret(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload: string) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, keyFromSecret(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function ensureYtmAccountSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ytm_accounts (
      user_id TEXT PRIMARY KEY,
      cookie_enc TEXT,
      oauth_enc TEXT,
      connected_at INTEGER NOT NULL,
      last_sync_at INTEGER,
      last_sync_summary TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

ensureYtmAccountSchema();

export type YtmAccountPublic = {
  connected: boolean;
  hasCookie: boolean;
  hasOauth: boolean;
  connectedAt: number | null;
  lastSyncAt: number | null;
  lastSyncSummary: string | null;
};

export function getYtmAccountPublic(userId: string): YtmAccountPublic {
  const row = db.prepare('SELECT * FROM ytm_accounts WHERE user_id = ?').get(userId) as
    | {
        cookie_enc: string | null;
        oauth_enc: string | null;
        connected_at: number;
        last_sync_at: number | null;
        last_sync_summary: string | null;
      }
    | undefined;
  if (!row) {
    return {
      connected: false,
      hasCookie: false,
      hasOauth: false,
      connectedAt: null,
      lastSyncAt: null,
      lastSyncSummary: null,
    };
  }
  return {
    connected: Boolean(row.cookie_enc || row.oauth_enc),
    hasCookie: Boolean(row.cookie_enc),
    hasOauth: Boolean(row.oauth_enc),
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    lastSyncSummary: row.last_sync_summary,
  };
}

export function getYtmCredentials(userId: string): {
  cookie?: string;
  oauth?: Record<string, unknown>;
} | null {
  const row = db.prepare('SELECT cookie_enc, oauth_enc FROM ytm_accounts WHERE user_id = ?').get(userId) as
    | { cookie_enc: string | null; oauth_enc: string | null }
    | undefined;
  if (!row || (!row.cookie_enc && !row.oauth_enc)) return null;
  return {
    cookie: row.cookie_enc ? decrypt(row.cookie_enc) : undefined,
    oauth: row.oauth_enc ? (JSON.parse(decrypt(row.oauth_enc)) as Record<string, unknown>) : undefined,
  };
}

export function saveYtmCookie(userId: string, cookie: string) {
  const cleaned = cookie.replace(/\r?\n/g, ' ').trim();
  if (!cleaned || cleaned.length < 20) throw new Error('Cookie YTM invalide ou trop court');
  const needed = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'];
  const missing = needed.filter((k) => !cleaned.includes(`${k}=`));
  if (missing.length >= 3) {
    throw new Error(
      `Cookie incomplet (manque souvent ${missing.join(', ')}). Depuis music.youtube.com connecté → F12 → Application → Cookies → copie la chaîne Cookie.`,
    );
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO ytm_accounts (user_id, cookie_enc, oauth_enc, connected_at)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET cookie_enc = excluded.cookie_enc, oauth_enc = NULL, connected_at = excluded.connected_at`,
  ).run(userId, encrypt(cleaned), now);
}

export function saveYtmOauth(userId: string, tokens: Record<string, unknown>) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO ytm_accounts (user_id, cookie_enc, oauth_enc, connected_at)
     VALUES (?, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET oauth_enc = excluded.oauth_enc, cookie_enc = NULL, connected_at = excluded.connected_at`,
  ).run(userId, encrypt(JSON.stringify(tokens)), now);
}

export function disconnectYtm(userId: string) {
  db.prepare('DELETE FROM ytm_accounts WHERE user_id = ?').run(userId);
}

export function markYtmSynced(userId: string, summary: string) {
  db.prepare(
    `UPDATE ytm_accounts SET last_sync_at = ?, last_sync_summary = ? WHERE user_id = ?`,
  ).run(Date.now(), summary, userId);
}
