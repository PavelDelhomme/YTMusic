import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export function ensureRecoSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id TEXT PRIMARY KEY,
      genres TEXT DEFAULT '[]',
      moods TEXT DEFAULT '[]',
      moments TEXT DEFAULT '[]',
      onboarding_done INTEGER DEFAULT 0,
      discovery_bias REAL DEFAULT 0.1,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_follows (
      user_id TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      artist_name TEXT,
      payload TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, artist_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listen_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      event TEXT NOT NULL,
      progress_pct REAL DEFAULT 0,
      duration_ms INTEGER,
      seed_id TEXT,
      hour INTEGER,
      is_weekend INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      clicked_id TEXT,
      clicked_kind TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, kind, target_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reco_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      seed_id TEXT,
      verdict TEXT NOT NULL,
      context TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reco_weights (
      mode TEXT PRIMARY KEY,
      w_content REAL NOT NULL,
      w_seq REAL NOT NULL,
      w_ctx REAL NOT NULL,
      w_bandit REAL NOT NULL,
      w_satisf REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listen_user_time ON listen_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_search_user_time ON search_history(user_id, created_at DESC);
  `);

  const defaults: Array<[string, number, number, number, number, number]> = [
    ['radio', 0.35, 0.25, 0.2, 0.1, 0.1],
    ['discover', 0.2, 0.15, 0.15, 0.35, 0.15],
    ['focus', 0.4, 0.3, 0.2, 0.05, 0.05],
  ];
  const now = Date.now();
  for (const [mode, w1, w2, w3, w4, w5] of defaults) {
    db.prepare(
      `INSERT OR IGNORE INTO reco_weights (mode, w_content, w_seq, w_ctx, w_bandit, w_satisf, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(mode, w1, w2, w3, w4, w5, now);
  }
}

ensureRecoSchema();

export type Prefs = {
  genres: string[];
  moods: string[];
  moments: string[];
  onboardingDone: boolean;
  discoveryBias: number;
};

export function getPrefs(userId: string): Prefs {
  const row = db.prepare('SELECT * FROM user_prefs WHERE user_id = ?').get(userId) as
    | {
        genres: string;
        moods: string;
        moments: string;
        onboarding_done: number;
        discovery_bias: number;
      }
    | undefined;
  if (!row) {
    return { genres: [], moods: [], moments: [], onboardingDone: false, discoveryBias: 0.1 };
  }
  return {
    genres: JSON.parse(row.genres || '[]'),
    moods: JSON.parse(row.moods || '[]'),
    moments: JSON.parse(row.moments || '[]'),
    onboardingDone: Boolean(row.onboarding_done),
    discoveryBias: row.discovery_bias ?? 0.1,
  };
}

export function savePrefs(
  userId: string,
  patch: Partial<Prefs> & { onboardingDone?: boolean },
): Prefs {
  const cur = getPrefs(userId);
  const next: Prefs = {
    genres: patch.genres ?? cur.genres,
    moods: patch.moods ?? cur.moods,
    moments: patch.moments ?? cur.moments,
    onboardingDone: patch.onboardingDone ?? cur.onboardingDone,
    discoveryBias: patch.discoveryBias ?? cur.discoveryBias,
  };
  db.prepare(
    `INSERT INTO user_prefs (user_id, genres, moods, moments, onboarding_done, discovery_bias, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       genres = excluded.genres,
       moods = excluded.moods,
       moments = excluded.moments,
       onboarding_done = excluded.onboarding_done,
       discovery_bias = excluded.discovery_bias,
       updated_at = excluded.updated_at`,
  ).run(
    userId,
    JSON.stringify(next.genres),
    JSON.stringify(next.moods),
    JSON.stringify(next.moments),
    next.onboardingDone ? 1 : 0,
    next.discoveryBias,
    Date.now(),
  );
  return next;
}

export function followArtist(
  userId: string,
  artist: { id: string; name?: string; payload?: unknown },
) {
  db.prepare(
    `INSERT INTO artist_follows (user_id, artist_id, artist_name, payload, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, artist_id) DO UPDATE SET artist_name = excluded.artist_name, payload = excluded.payload`,
  ).run(
    userId,
    artist.id,
    artist.name || null,
    JSON.stringify(artist.payload || artist),
    Date.now(),
  );
}

export function unfollowArtist(userId: string, artistId: string) {
  db.prepare('DELETE FROM artist_follows WHERE user_id = ? AND artist_id = ?').run(userId, artistId);
}

export function listFollows(userId: string) {
  return db
    .prepare('SELECT * FROM artist_follows WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as any[];
}

export function recordListenEvent(opts: {
  userId: string;
  trackId: string;
  event: 'start' | 'progress' | 'complete' | 'skip';
  progressPct?: number;
  durationMs?: number;
  seedId?: string;
}) {
  const now = new Date();
  db.prepare(
    `INSERT INTO listen_events
     (id, user_id, track_id, event, progress_pct, duration_ms, seed_id, hour, is_weekend, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    opts.userId,
    opts.trackId,
    opts.event,
    opts.progressPct ?? 0,
    opts.durationMs ?? null,
    opts.seedId || null,
    now.getHours(),
    now.getDay() === 0 || now.getDay() === 6 ? 1 : 0,
    Date.now(),
  );
}

export function listListenEvents(userId: string, limit = 200) {
  return db
    .prepare(
      `SELECT * FROM listen_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit);
}

export function addSearchHistory(
  userId: string,
  query: string,
  clicked?: { id?: string; kind?: string },
) {
  const q = query.trim().replace(/\s+/g, ' ');
  // Ignore frappes trop courtes (pollution « K », « Ke », « Ken »)
  if (!q || (q.length < 3 && !clicked?.id)) return;

  const recent = listSearchHistory(userId, 8) as { id: string; query: string; created_at: number }[];
  const nq = q.toLowerCase();
  const now = Date.now();

  // Remplace les préfixes progressifs récents (« Keny » → « Keny Arkana »)
  for (const last of recent) {
    const lq = String(last.query || '').trim().toLowerCase();
    if (!lq) continue;
    const age = now - Number(last.created_at || 0);
    if (age > 90_000) continue;
    if (nq === lq && !clicked?.id) return; // doublon exact récent
    if (nq.startsWith(lq) || lq.startsWith(nq)) {
      db.prepare('DELETE FROM search_history WHERE id = ? AND user_id = ?').run(last.id, userId);
    }
  }

  db.prepare(
    `INSERT INTO search_history (id, user_id, query, clicked_id, clicked_kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, q, clicked?.id || null, clicked?.kind || null, now);
}

export function listSearchHistory(userId: string, limit = 30) {
  return db
    .prepare(
      `SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as any[];
}

export function listPins(userId: string) {
  return (
    db
      .prepare('SELECT * FROM pins WHERE user_id = ? ORDER BY position ASC, created_at DESC')
      .all(userId) as any[]
  ).map((p) => ({
    id: p.id,
    kind: p.kind,
    targetId: p.target_id,
    payload: JSON.parse(p.payload),
    position: p.position,
    createdAt: p.created_at,
  }));
}

export function addPin(
  userId: string,
  kind: string,
  targetId: string,
  payload: unknown,
) {
  const id = randomUUID();
  const max = (
    db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM pins WHERE user_id = ?').get(userId) as {
      m: number;
    }
  ).m;
  db.prepare(
    `INSERT INTO pins (id, user_id, kind, target_id, payload, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind, target_id) DO UPDATE SET payload = excluded.payload`,
  ).run(id, userId, kind, targetId, JSON.stringify(payload), max + 1, Date.now());
  return listPins(userId);
}

export function removePin(userId: string, pinId: string) {
  db.prepare('DELETE FROM pins WHERE id = ? AND user_id = ?').run(pinId, userId);
  return listPins(userId);
}

export function removePinByTarget(userId: string, targetId: string) {
  db.prepare('DELETE FROM pins WHERE user_id = ? AND target_id = ?').run(userId, targetId);
  return listPins(userId);
}

export function addRecoFeedback(opts: {
  userId: string;
  trackId: string;
  seedId?: string;
  verdict: 'good' | 'bad';
  context?: string;
}) {
  db.prepare(
    `INSERT INTO reco_feedback (id, user_id, track_id, seed_id, verdict, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    opts.userId,
    opts.trackId,
    opts.seedId || null,
    opts.verdict,
    opts.context || null,
    Date.now(),
  );
}

export function getWeights(mode = 'radio') {
  const row = db.prepare('SELECT * FROM reco_weights WHERE mode = ?').get(mode) as
    | {
        mode: string;
        w_content: number;
        w_seq: number;
        w_ctx: number;
        w_bandit: number;
        w_satisf: number;
      }
    | undefined;
  if (!row) {
    return { mode, w_content: 0.35, w_seq: 0.25, w_ctx: 0.2, w_bandit: 0.1, w_satisf: 0.1 };
  }
  return row;
}

export function listWeights() {
  return db.prepare('SELECT * FROM reco_weights ORDER BY mode').all();
}

export function saveWeights(
  mode: string,
  w: { w_content: number; w_seq: number; w_ctx: number; w_bandit: number; w_satisf: number },
) {
  db.prepare(
    `INSERT INTO reco_weights (mode, w_content, w_seq, w_ctx, w_bandit, w_satisf, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mode) DO UPDATE SET
       w_content = excluded.w_content,
       w_seq = excluded.w_seq,
       w_ctx = excluded.w_ctx,
       w_bandit = excluded.w_bandit,
       w_satisf = excluded.w_satisf,
       updated_at = excluded.updated_at`,
  ).run(mode, w.w_content, w.w_seq, w.w_ctx, w.w_bandit, w.w_satisf, Date.now());
  return getWeights(mode);
}

export function recoAdminStats() {
  const feedback = db
    .prepare(
      `SELECT verdict, COUNT(*) as c FROM reco_feedback
       WHERE created_at > ? GROUP BY verdict`,
    )
    .all(Date.now() - 7 * 24 * 3600 * 1000) as { verdict: string; c: number }[];
  const listens = (
    db
      .prepare(`SELECT COUNT(*) as c FROM listen_events WHERE created_at > ?`)
      .get(Date.now() - 24 * 3600 * 1000) as { c: number }
  ).c;
  const skips = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM listen_events WHERE event = 'skip' AND created_at > ?`,
      )
      .get(Date.now() - 24 * 3600 * 1000) as { c: number }
  ).c;
  return { feedback, listens24h: listens, skips24h: skips, weights: listWeights() };
}
