#!/usr/bin/env node
/**
 * Batterie E2E API YTMusic (local et/ou prod).
 * Usage:
 *   node --env-file=.env scripts/e2e-battery.mjs
 *   API_BASE_URL=https://ytmusic.delhomme.ovh node --env-file=.env scripts/e2e-battery.mjs
 *   E2E_TARGETS=local,prod node --env-file=.env scripts/e2e-battery.mjs
 */
import { writeFileSync } from 'node:fs';

const email = process.env.SEED_EMAIL || process.env.VITE_DEV_EMAIL || '';
const password = process.env.SEED_PASSWORD || process.env.VITE_DEV_PASSWORD || '';
const targetsEnv = (process.env.E2E_TARGETS || process.env.API_BASE_URL || 'local,prod').trim();

const PRESETS = {
  local: 'http://127.0.0.1:8787',
  prod: 'https://ytmusic.delhomme.ovh',
};

function resolveTargets() {
  if (targetsEnv.startsWith('http')) return [{ name: 'custom', base: targetsEnv.replace(/\/$/, '') }];
  return targetsEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, base: PRESETS[name] || name.replace(/\/$/, '') }));
}

const results = [];
const reportPath = '/tmp/ytmusic-e2e-battery.json';

function rec(target, id, ok, detail = '') {
  const row = { target, id, ok: !!ok, detail: String(detail).slice(0, 240) };
  results.push(row);
  const mark = ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} [${target}] ${id}${detail ? ` — ${row.detail}` : ''}`);
}

async function req(base, path, { method = 'GET', token, body, raw = false } = {}) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = text;
  if (!raw) {
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
  }
  return { status: r.status, data, headers: r.headers, text };
}

function firstTrack(home) {
  for (const s of home?.shelves || []) {
    for (const it of s.items || []) {
      if (it?.id && (it.type === 'song' || it.type === 'video' || !it.type)) return it;
    }
  }
  return null;
}

async function runTarget({ name, base }) {
  console.log(`\n======== ${name} ${base} ========`);
  let token = null;

  // --- public ---
  {
    const h = await req(base, '/api/health');
    rec(name, 'health', h.status === 200 && h.data?.ok, `v=${h.data?.version || '?'} env=${h.data?.auth?.appEnv}`);
  }
  {
    const c = await req(base, '/api/auth/config');
    rec(name, 'auth.config', c.status === 200, JSON.stringify(c.data?.appEnv));
  }
  {
    const g = await req(base, '/api/home');
    rec(name, 'home.unauth=401', g.status === 401, `got ${g.status}`);
  }
  {
    const g = await req(base, '/api/search?q=test');
    rec(name, 'search.unauth=401', g.status === 401, `got ${g.status}`);
  }
  {
    const g = await req(base, '/api/stream/dQw4w9WgXcQ/url');
    rec(name, 'stream.unauth=401', g.status === 401, `got ${g.status}`);
  }
  {
    const g = await req(base, '/api/deploy/apk/info');
    rec(name, 'deploy.apk.info', g.status === 200 || g.status === 404, `status=${g.status}`);
  }

  // --- login ---
  if (!email || !password) {
    rec(name, 'login', false, 'SEED_EMAIL/PASSWORD manquants');
    return;
  }
  {
    const login = await req(base, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    token = login.data?.token || login.data?.accessToken || null;
    rec(
      name,
      'login',
      login.status === 200 && !!token,
      login.status === 200 ? `user=${login.data?.user?.email || '?'}` : `${login.status} ${JSON.stringify(login.data)}`,
    );
    if (!token) return;
  }

  {
    const me = await req(base, '/api/auth/me', { token });
    rec(name, 'auth.me', me.status === 200 && (me.data?.user?.email || me.data?.email), JSON.stringify(me.data?.user?.email || me.data));
  }

  let track = null;
  let artistId = null;
  let albumId = null;

  {
    const home = await req(base, '/api/home', { token });
    const shelves = home.data?.shelves || [];
    track = firstTrack(home.data);
    rec(
      name,
      'home',
      home.status === 200 && shelves.length > 0,
      `shelves=${shelves.length} first=${track?.title || '∅'}`,
    );
  }

  {
    const ex = await req(base, '/api/explore', { token });
    rec(name, 'explore', ex.status === 200, `shelves=${(ex.data?.shelves || ex.data || []).length || '?'}`);
  }

  {
    const s = await req(base, '/api/search?q=Daft+Punk', { token });
    const songs = s.data?.songs || s.data?.tracks || s.data?.results || [];
    const items = Array.isArray(songs) ? songs : s.data?.shelves?.[0]?.items || [];
    if (!track && items[0]) track = items[0];
    // extract artist/album if present
    for (const it of items) {
      if (!artistId && (it.artists?.[0]?.id || it.artistId)) artistId = it.artists?.[0]?.id || it.artistId;
      if (!albumId && (it.album?.id || it.albumId)) albumId = it.album?.id || it.albumId;
    }
    rec(name, 'search', s.status === 200, `items≈${items.length} status=${s.status}`);
  }

  {
    const sug = await req(base, '/api/search/suggestions?q=da', { token });
    rec(name, 'search.suggestions', sug.status === 200, `n=${(sug.data?.suggestions || sug.data || []).length}`);
  }

  if (!track?.id) {
    rec(name, 'track.pick', false, 'aucun titre pour la suite');
    return;
  }
  rec(name, 'track.pick', true, `${track.id} ${track.title || ''}`);

  {
    const t = await req(base, `/api/track/${track.id}`, { token });
    rec(name, 'track.detail', t.status === 200, t.data?.title || t.data?.track?.title || `status=${t.status}`);
    if (!artistId) artistId = t.data?.artists?.[0]?.id || t.data?.artistId;
    if (!albumId) albumId = t.data?.album?.id || t.data?.albumId;
  }

  {
    const rel = await req(base, `/api/track/${track.id}/related`, { token });
    rec(name, 'track.related', rel.status === 200, `n=${(rel.data?.tracks || rel.data?.items || rel.data || []).length}`);
  }

  {
    const up = await req(base, `/api/track/${track.id}/upnext`, { token });
    rec(name, 'track.upnext', up.status === 200, `n=${(up.data?.tracks || up.data?.items || up.data || []).length}`);
  }

  {
    const ly = await req(base, `/api/track/${track.id}/lyrics`, { token });
    rec(name, 'track.lyrics', ly.status === 200 || ly.status === 404, `status=${ly.status}`);
  }

  // stream url + bytes
  {
    const u = await req(base, `/api/stream/${track.id}/url`, { token });
    const ok = u.status === 200 && (u.data?.url || u.data?.streamUrl);
    rec(name, 'stream.url', ok, ok ? 'url ok' : `${u.status} ${JSON.stringify(u.data).slice(0, 160)}`);
  }
  {
    const r = await fetch(`${base}/api/stream/${track.id}`, {
      headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-2047' },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const ok = (r.status === 200 || r.status === 206) && buf.length > 100;
    rec(name, 'stream.bytes', ok, `HTTP ${r.status} bytes=${buf.length}`);
  }

  if (artistId) {
    const a = await req(base, `/api/artist/${artistId}`, { token });
    rec(name, 'artist.detail', a.status === 200, a.data?.name || a.data?.artist?.name || `status=${a.status}`);
    const songs = await req(base, `/api/artist/${artistId}/songs`, { token });
    rec(name, 'artist.songs', songs.status === 200, `n=${(songs.data?.songs || songs.data?.tracks || songs.data?.items || []).length}`);
    const radio = await req(base, `/api/artist/${artistId}/radio`, { token });
    rec(name, 'artist.radio', radio.status === 200 || radio.status === 404, `status=${radio.status}`);
  } else {
    rec(name, 'artist.detail', false, 'pas d’artistId');
    rec(name, 'artist.songs', false, 'skip');
    rec(name, 'artist.radio', false, 'skip');
  }

  if (albumId) {
    const a = await req(base, `/api/album/${albumId}`, { token });
    rec(name, 'album.detail', a.status === 200, a.data?.title || a.data?.name || `status=${a.status}`);
  } else {
    rec(name, 'album.detail', false, 'pas d’albumId (non bloquant si search pauvre)');
  }

  {
    const lib = await req(base, '/api/library', { token });
    rec(name, 'library', lib.status === 200, `keys=${Object.keys(lib.data || {}).join(',')}`);
  }

  {
    const like = await req(base, '/api/like', {
      method: 'POST',
      token,
      body: { videoId: track.id, track },
    });
    // endpoints may vary
    const like2 =
      like.status >= 400
        ? await req(base, `/api/library/like`, { method: 'POST', token, body: { id: track.id } })
        : like;
    rec(name, 'like', like.status < 500 || like2.status < 500, `a=${like.status} b=${like2.status}`);
  }

  {
    const hist = await req(base, '/api/history', {
      method: 'POST',
      token,
      body: { videoId: track.id, trackId: track.id, title: track.title },
    });
    rec(name, 'history.write', hist.status >= 200 && hist.status < 500, `status=${hist.status}`);
  }

  {
    const listen = await req(base, '/api/listen', {
      method: 'POST',
      token,
      body: { trackId: track.id, event: 'start', position: 0 },
    });
    rec(name, 'listen.start', listen.status >= 200 && listen.status < 500, `status=${listen.status}`);
  }

  {
    const pins = await req(base, '/api/pins', { token });
    rec(name, 'pins', pins.status === 200, `status=${pins.status}`);
  }

  {
    const prefs = await req(base, '/api/prefs', { token });
    rec(name, 'prefs', prefs.status === 200, `status=${prefs.status}`);
  }

  {
    const reco = await req(base, '/api/reco/home', { token });
    rec(name, 'reco.home', reco.status === 200 || reco.status === 404, `status=${reco.status}`);
  }

  {
    const sim = await req(base, `/api/reco/similar/${track.id}`, { token });
    rec(name, 'reco.similar', sim.status === 200 || sim.status === 404, `status=${sim.status}`);
  }

  {
    const opts = await req(base, '/api/auth/passkeys/login/options', {
      method: 'POST',
      body: { email },
    });
    rec(
      name,
      'passkey.login.options',
      opts.status === 200 && (opts.data?.challenge || opts.data?.publicKey),
      `status=${opts.status}`,
    );
  }
  {
    const list = await req(base, '/api/auth/passkeys', { token });
    rec(
      name,
      'passkey.list',
      list.status === 200,
      `n=${(list.data?.passkeys || []).length} status=${list.status}`,
    );
  }
  {
    const reg = await req(base, '/api/auth/passkeys/register/options', {
      method: 'POST',
      token,
      body: {},
    });
    rec(
      name,
      'passkey.register.options',
      reg.status === 200 && (reg.data?.challenge || reg.data?.publicKey),
      `status=${reg.status}`,
    );
  }

  // admin (si compte admin)
  {
    const st = await req(base, '/api/admin/status', { token });
    rec(name, 'admin.status', st.status === 200 || st.status === 403, `status=${st.status}`);
  }
  {
    const ck = await req(base, '/api/admin/youtube-cookies', { token });
    rec(
      name,
      'admin.youtube-cookies',
      ck.status === 200 || ck.status === 403 || ck.status === 404,
      ck.status === 200 ? JSON.stringify(ck.data).slice(0, 120) : `status=${ck.status}`,
    );
  }
}

async function main() {
  const targets = resolveTargets();
  console.log('E2E battery targets:', targets.map((t) => t.name).join(', '));
  console.log('email:', email || '(missing)');
  for (const t of targets) {
    try {
      await runTarget(t);
    } catch (e) {
      rec(t.name, 'crash', false, e?.message || String(e));
    }
  }

  const byTarget = {};
  for (const r of results) {
    byTarget[r.target] ||= { ok: 0, fail: 0, rows: [] };
    byTarget[r.target].rows.push(r);
    if (r.ok) byTarget[r.target].ok++;
    else byTarget[r.target].fail++;
  }

  console.log('\n======== SUMMARY ========');
  for (const [k, v] of Object.entries(byTarget)) {
    console.log(`${k}: ${v.ok} OK / ${v.fail} FAIL`);
  }

  writeFileSync(
    reportPath,
    JSON.stringify({ at: new Date().toISOString(), email, targets, byTarget, results }, null, 2),
  );
  console.log(`\nReport: ${reportPath}`);
  const totalFail = results.filter((r) => !r.ok).length;
  process.exitCode = totalFail ? 1 : 0;
}

await main();
