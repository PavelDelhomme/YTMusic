import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getYtmCredentials } from './ytm-account.js';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA = join(ROOT, 'data');
/** Cookie header brut (une ligne) — pour youtubei.js */
export const YT_COOKIE_HEADER_PATH = join(DATA, 'youtube-cookies.header');
/** Netscape cookies.txt — pour yt-dlp --cookies */
export const YT_COOKIE_NETSCAPE_PATH = join(DATA, 'youtube-cookies.txt');

mkdirSync(DATA, { recursive: true });

export type YoutubeCookiesStatus = {
  configured: boolean;
  source: 'env' | 'header-file' | 'netscape-file' | 'ytm-account' | null;
  headerPath: string;
  netscapePath: string;
  hint: string;
};

function looksLikeNetscape(raw: string) {
  return /^# Netscape/i.test(raw) || /\tyoutube\.com\t/.test(raw);
}

function cookieFromYtmAccounts(): string | undefined {
  try {
    const row = db
      .prepare(
        `SELECT user_id FROM ytm_accounts WHERE cookie_enc IS NOT NULL AND cookie_enc != '' LIMIT 1`,
      )
      .get() as { user_id: string } | undefined;
    if (!row?.user_id) return undefined;
    const creds = getYtmCredentials(row.user_id);
    const c = creds?.cookie?.trim();
    return c ? c.replace(/^Cookie:\s*/i, '') : undefined;
  } catch {
    return undefined;
  }
}

/** Cookie header pour Innertube (youtubei.js). */
export function resolveYoutubeCookieHeader(): string | undefined {
  const env = (process.env.YOUTUBE_COOKIES || '').trim();
  if (env) return env.replace(/^Cookie:\s*/i, '');

  const fileEnv = (process.env.YOUTUBE_COOKIES_FILE || '').trim();
  if (fileEnv && existsSync(fileEnv)) {
    const raw = readFileSync(fileEnv, 'utf8').trim();
    if (raw && !looksLikeNetscape(raw)) return raw.replace(/^Cookie:\s*/i, '');
  }

  if (existsSync(YT_COOKIE_HEADER_PATH)) {
    const raw = readFileSync(YT_COOKIE_HEADER_PATH, 'utf8').trim();
    if (raw) return raw.replace(/^Cookie:\s*/i, '');
  }

  return cookieFromYtmAccounts();
}

/** Chemin cookies Netscape pour yt-dlp, ou undefined. */
export function resolveYoutubeCookiesFileForYtDlp(): string | undefined {
  const fileEnv = (process.env.YOUTUBE_COOKIES_FILE || '').trim();
  if (fileEnv && existsSync(fileEnv)) {
    try {
      if (looksLikeNetscape(readFileSync(fileEnv, 'utf8'))) return fileEnv;
    } catch {
      /* ignore */
    }
  }
  if (existsSync(YT_COOKIE_NETSCAPE_PATH)) {
    try {
      if (looksLikeNetscape(readFileSync(YT_COOKIE_NETSCAPE_PATH, 'utf8'))) {
        return YT_COOKIE_NETSCAPE_PATH;
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Args à ajouter aux spawns yt-dlp. */
export function ytDlpCookieArgs(): string[] {
  const file = resolveYoutubeCookiesFileForYtDlp();
  if (file) return ['--cookies', file];
  const header = resolveYoutubeCookieHeader();
  if (header) return ['--add-header', `Cookie:${header}`];
  return [];
}

export function youtubeCookiesFingerprint(): string {
  const h = resolveYoutubeCookieHeader() || '';
  const f = resolveYoutubeCookiesFileForYtDlp() || '';
  return createHash('sha256').update(h + '|' + f).digest('hex').slice(0, 16);
}

export function youtubeCookiesStatus(): YoutubeCookiesStatus {
  const header = resolveYoutubeCookieHeader();
  const netscape = resolveYoutubeCookiesFileForYtDlp();
  let source: YoutubeCookiesStatus['source'] = null;
  if ((process.env.YOUTUBE_COOKIES || '').trim()) source = 'env';
  else if (existsSync(YT_COOKIE_HEADER_PATH) && readFileSync(YT_COOKIE_HEADER_PATH, 'utf8').trim())
    source = 'header-file';
  else if (netscape) source = 'netscape-file';
  else if (header) source = 'ytm-account';

  return {
    configured: Boolean(header || netscape),
    source,
    headerPath: YT_COOKIE_HEADER_PATH,
    netscapePath: YT_COOKIE_NETSCAPE_PATH,
    hint: header || netscape
      ? 'Cookies YouTube présents — stream anti-bot OK'
      : 'VPS bloqué par YouTube sans cookies — Admin → coller Cookie youtube.com, ou Importer → cookies YTM',
  };
}

/** Sauvegarde un header Cookie=… (DevTools) pour le stream serveur. */
export function saveYoutubeCookieHeader(raw: string) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^Cookie:\s*/i, '');
  if (cleaned.length < 40) {
    throw new Error('Cookie trop court — copie le header Cookie complet depuis youtube.com');
  }
  writeFileSync(YT_COOKIE_HEADER_PATH, cleaned + '\n', 'utf8');
  return youtubeCookiesStatus();
}

export function clearYoutubeCookieHeader() {
  writeFileSync(YT_COOKIE_HEADER_PATH, '', 'utf8');
  return youtubeCookiesStatus();
}
