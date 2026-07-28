import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'data', 'img-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const ALLOWED =
  /^(https?:\/\/)?([a-z0-9.-]+\.)?(googleusercontent\.com|ggpht\.com|ytimg\.com|youtube\.com|yt3\.ggpht\.com)\//i;

export async function handleImageProxy(req: Request, res: Response) {
  try {
    const raw = String(req.query.u || '');
    if (!raw) {
      res.status(400).json({ error: 'u requis' });
      return;
    }
    let url: string;
    try {
      url = decodeURIComponent(raw);
    } catch {
      url = raw;
    }
    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: 'URL invalide' });
      return;
    }
    if (!ALLOWED.test(url) && !/i\.ytimg\.com|yt3\.|ggpht|googleusercontent|lh3\.google/i.test(url)) {
      res.status(403).json({ error: 'domaine non autorisé' });
      return;
    }

    const key = createHash('sha1').update(url).digest('hex');
    const file = join(CACHE_DIR, key);
    const meta = join(CACHE_DIR, `${key}.meta`);

    if (existsSync(file) && existsSync(meta)) {
      const age = Date.now() - statSync(file).mtimeMs;
      if (age < 7 * 24 * 3600 * 1000) {
        const type = readFileSync(meta, 'utf8') || 'image/jpeg';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.send(readFileSync(file));
        return;
      }
    }

    const upstream = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://music.youtube.com/',
      },
      redirect: 'follow',
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'fetch failed' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    writeFileSync(file, buf);
    writeFileSync(meta, type);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message || err) });
  }
}
