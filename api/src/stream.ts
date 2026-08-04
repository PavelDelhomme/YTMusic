import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { getAudioFormat, getVideoFormat, getYT } from './yt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const YTDLP = join(ROOT, 'bin', 'yt-dlp');
const CACHE_DIR = join(ROOT, 'data', 'cache');

function ensureCache() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function cachePath(videoId: string) {
  ensureCache();
  return join(CACHE_DIR, `${videoId}.m4a`);
}

async function streamViaInnertube(videoId: string, res: Response) {
  const innertube = await getYT();
  const stream = await innertube.download(videoId, {
    type: 'audio',
    quality: 'bestefficiency',
    format: 'any',
  });

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (!res.write(Buffer.from(value))) {
          await new Promise((r) => res.once('drain', r));
        }
      }
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err) });
    else res.end();
  }
}

function streamViaYtDlp(videoId: string, res: Response) {
  return new Promise<void>((resolve, reject) => {
    if (!existsSync(YTDLP)) {
      reject(new Error('yt-dlp introuvable'));
      return;
    }

    const proc = spawn(
      YTDLP,
      [
        '-f',
        'bestaudio[ext=m4a]/bestaudio/best',
        '-o',
        '-',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    proc.stdout.pipe(res);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exit ${code}`));
    });
    res.on('close', () => {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    });
  });
}

export async function handleStream(req: Request, res: Response) {
  const videoId = String(req.params.id || '');
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }

  const cached = cachePath(videoId);
  if (existsSync(cached)) {
    const size = statSync(cached).size;
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : size - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', end - start + 1);
      res.setHeader('Content-Type', 'audio/mp4');
      const { createReadStream } = await import('node:fs');
      createReadStream(cached, { start, end }).pipe(res);
      return;
    }
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Length', size);
    res.setHeader('Accept-Ranges', 'bytes');
    const { createReadStream } = await import('node:fs');
    createReadStream(cached).pipe(res);
    return;
  }

  try {
    const format = await getAudioFormat(videoId);
    if (format.url) {
      // Clients natifs (Android ExoPlayer) : 302 direct googlevideo = plus rapide.
      // Navigateur web : proxy (CORS / Workbox).
      if (wantsDirectRedirect(req)) {
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(302, format.url);
        return;
      }
      const upstream = await fetch(format.url, {
        headers: req.headers.range ? { Range: String(req.headers.range) } : {},
      });
      // Ne pas propager 403/502 googlevideo brut → fallbacks Innertube / yt-dlp
      if (upstream.status >= 400) {
        throw new Error(`upstream audio ${upstream.status}`);
      }
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      const ar = upstream.headers.get('accept-ranges');
      if (ct) res.setHeader('Content-Type', ct);
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      if (ar) res.setHeader('Accept-Ranges', ar);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((r) => res.once('drain', r));
        }
      }
      res.end();
      return;
    }
  } catch {
    /* fallback */
  }

  try {
    await streamViaInnertube(videoId, res);
    return;
  } catch {
    /* fallback */
  }

  try {
    await streamViaYtDlp(videoId, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Impossible de streamer audio', detail: String(err) });
    }
  }
}

/** Pré-résout l’URL audio/vidéo (chauffe le cache format sans streamer). */
export async function handleStreamUrl(req: Request, res: Response) {
  const videoId = String(req.params.id || '');
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  const wantVideo = String(req.query.type || req.query.media || '') === 'video';
  try {
    const format = wantVideo ? await getVideoFormat(videoId) : await getAudioFormat(videoId);
    res.json({
      url: format.url,
      expiresAt: format.expiresAt,
      mimeType: format.mimeType ?? null,
      kind: wantVideo ? 'video' : 'audio',
    });
  } catch (err) {
    res.status(502).json({
      error: wantVideo ? 'Impossible de résoudre la vidéo' : 'Impossible de résoudre le stream',
      detail: String(err),
    });
  }
}

/** Warm batch : déchiffre plusieurs formats en parallèle (prefetch file d’attente). */
export async function handleStreamWarm(req: Request, res: Response) {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = [...new Set(raw.map((x: unknown) => String(x || '')).filter((id: string) => /^[a-zA-Z0-9_-]{11}$/.test(id)))].slice(
    0,
    32,
  );
  if (!ids.length) {
    res.status(400).json({ error: 'ids requis' });
    return;
  }
  const results = await Promise.allSettled(ids.map((id) => getAudioFormat(id)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  res.json({ ok: true, requested: ids.length, warmed: ok });
}

/**
 * Redirect 302 vers googlevideo — uniquement si demandé explicitement (?redirect=1).
 * Ne pas auto-rediriger ExoPlayer/OkHttp : l’URL CDN est liée à l’IP du serveur API,
 * donc un client sur une autre IP reçoit 403.
 */
function wantsDirectRedirect(req: Request): boolean {
  return String(req.query.redirect || '') === '1';
}

export async function downloadTrack(videoId: string): Promise<string> {
  ensureCache();
  const out = cachePath(videoId);
  if (existsSync(out) && statSync(out).size > 0) {
    return out;
  }

  if (existsSync(YTDLP)) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        YTDLP,
        [
          '-f',
          'bestaudio[ext=m4a]/bestaudio/best',
          '-x',
          '--audio-format',
          'm4a',
          '--audio-quality',
          '0',
          '-o',
          out,
          '--no-playlist',
          '--quiet',
          '--no-warnings',
          `https://www.youtube.com/watch?v=${videoId}`,
        ],
        { stdio: 'inherit' },
      );
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp ${code}`))));
      proc.on('error', reject);
    });
  } else {
    const innertube = await getYT();
    const stream = await innertube.download(videoId, {
      type: 'audio',
      quality: 'bestefficiency',
    });
    const file = createWriteStream(out);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (!file.write(Buffer.from(value))) {
          await new Promise<void>((r) => file.once('drain', () => r()));
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      file.end(() => resolve());
      file.on('error', reject);
    });
  }

  return out;
}

void pipeline;
