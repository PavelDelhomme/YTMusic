import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from './db.js';

/** Schema extensions for auth longevity, email verify, 2FA, telemetry */
export function ensurePlatformSchema() {
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const add = (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      /* exists */
    }
  };
  if (!names.has('email_verified')) add('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
  if (!names.has('totp_secret')) add('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  if (!names.has('totp_enabled')) add('ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_label TEXT,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      env TEXT,
      level TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT,
      stack TEXT,
      url TEXT,
      user_agent TEXT,
      user_id TEXT,
      device_id TEXT,
      meta TEXT,
      battery_level REAL,
      battery_charging INTEGER,
      perf_json TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_outbox (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      delivered INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_telemetry_level ON telemetry_events(level);
  `);
}

ensurePlatformSchema();

export function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export function createEmailToken(userId: string, kind: 'verify' | 'reset', ttlMs = 48 * 3600 * 1000) {
  const raw = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const now = Date.now();
  // Un seul lien actif par user/kind — invalide les anciens (évite confusion multi-mails)
  db.prepare(
    `UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL`,
  ).run(now, userId, kind);
  db.prepare(
    `INSERT INTO email_tokens (id, user_id, token_hash, kind, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, hashToken(raw), kind, now + ttlMs, now);
  return raw;
}

export type EmailTokenRedeem =
  | { ok: true; userId: string; already: boolean }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' };

/**
 * Consomme un jeton email de façon idempotente :
 * - 1er clic → ok, already=false
 * - reclic / StrictMode / prefetch déjà passé en POST → ok, already=true si même token
 */
export function redeemEmailToken(raw: string, kind: string): EmailTokenRedeem {
  const token = String(raw || '').trim();
  if (!token) return { ok: false, reason: 'missing' };
  const hash = hashToken(token);
  const row = db
    .prepare(`SELECT * FROM email_tokens WHERE token_hash = ? AND kind = ?`)
    .get(hash, kind) as
    | { id: string; user_id: string; expires_at: number; used_at: number | null }
    | undefined;
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at != null) {
    return { ok: true, userId: row.user_id, already: true };
  }
  if (row.expires_at < Date.now()) return { ok: false, reason: 'expired' };
  db.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return { ok: true, userId: row.user_id, already: false };
}

/** @deprecated préférer redeemEmailToken */
export function consumeEmailToken(raw: string, kind: string) {
  const r = redeemEmailToken(raw, kind);
  return r.ok ? r.userId : null;
}

export function markEmailVerified(userId: string) {
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(Date.now(), userId);
}

export function setTotpSecret(userId: string, secret: string | null, enabled = false) {
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = ?, updated_at = ? WHERE id = ?').run(
    secret,
    enabled ? 1 : 0,
    Date.now(),
    userId,
  );
}

export function createRefreshToken(userId: string, deviceLabel?: string, ttlMs = 400 * 24 * 3600 * 1000) {
  const raw = randomBytes(48).toString('base64url');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, device_label, expires_at, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, hashToken(raw), deviceLabel || null, Date.now() + ttlMs, Date.now(), Date.now());
  return { id, token: raw };
}

export function rotateRefreshToken(raw: string, deviceLabel?: string) {
  const row = db
    .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL`)
    .get(hashToken(raw)) as
    | { id: string; user_id: string; expires_at: number }
    | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(Date.now(), row.id);
  return { userId: row.user_id, ...createRefreshToken(row.user_id, deviceLabel) };
}

export function revokeRefreshToken(raw: string) {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?').run(
    Date.now(),
    hashToken(raw),
  );
}

export function insertTelemetry(ev: {
  env?: string;
  level: string;
  kind: string;
  message?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  deviceId?: string;
  meta?: unknown;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  perf?: unknown;
}) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO telemetry_events
     (id, created_at, env, level, kind, message, stack, url, user_agent, user_id, device_id, meta, battery_level, battery_charging, perf_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    Date.now(),
    ev.env || process.env.APP_ENV || 'local',
    ev.level,
    ev.kind,
    ev.message || null,
    ev.stack || null,
    ev.url || null,
    ev.userAgent || null,
    ev.userId || null,
    ev.deviceId || null,
    ev.meta ? JSON.stringify(ev.meta) : null,
    ev.batteryLevel ?? null,
    ev.batteryCharging == null ? null : ev.batteryCharging ? 1 : 0,
    ev.perf ? JSON.stringify(ev.perf) : null,
  );
  return id;
}

export function listTelemetry(opts: { level?: string; limit?: number; offset?: number } = {}) {
  const limit = Math.min(opts.limit || 100, 500);
  const offset = opts.offset || 0;
  if (opts.level) {
    return db
      .prepare(
        `SELECT * FROM telemetry_events WHERE level = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(opts.level, limit, offset);
  }
  return db
    .prepare(`SELECT * FROM telemetry_events ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset);
}

export function telemetryStats() {
  const byLevel = db
    .prepare(
      `SELECT level, COUNT(*) as c FROM telemetry_events
       WHERE created_at > ? GROUP BY level`,
    )
    .all(Date.now() - 7 * 24 * 3600 * 1000) as { level: string; c: number }[];
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM telemetry_events`).get() as { c: number }
  ).c;
  const last24 = (
    db
      .prepare(`SELECT COUNT(*) as c FROM telemetry_events WHERE created_at > ?`)
      .get(Date.now() - 24 * 3600 * 1000) as { c: number }
  ).c;
  const errors24 = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM telemetry_events WHERE level IN ('error','fatal') AND created_at > ?`,
      )
      .get(Date.now() - 24 * 3600 * 1000) as { c: number }
  ).c;
  return { total, last24, errors24, byLevel };
}

export function saveMailOutbox(to: string, subject: string, body: string) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO mail_outbox (id, to_email, subject, body, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(id, to, subject, body, Date.now());
  return id;
}

export function listMailOutbox(limit = 50) {
  return db
    .prepare(`SELECT * FROM mail_outbox ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}
