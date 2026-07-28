import { networkInterfaces } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

let buildJob: {
  status: 'idle' | 'running' | 'ok' | 'error';
  startedAt?: number;
  finishedAt?: number;
  log: string;
} = { status: 'idle', log: '' };

export function lanAddresses() {
  const nets = networkInterfaces();
  const out: { address: string; iface: string }[] = [];
  for (const [iface, list] of Object.entries(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) {
        out.push({ address: n.address, iface });
      }
    }
  }
  return out;
}

export function deployInfo(port: number) {
  const lan = lanAddresses();
  const clientDist = join(ROOT, 'web', 'dist', 'index.html');
  const built = existsSync(clientDist);
  const desktopPkg = join(ROOT, 'desktop', 'package.json');
  const clientPort = Number(process.env.CLIENT_PORT || 5173);
  // Dev (tsx/vite) → URLs sur :5173 pour le téléphone ; prod conteneur → :port API
  const servingDist =
    process.env.SERVE_DIST === '1' ||
    (process.env.NODE_ENV === 'production' && built);
  const appPort = servingDist ? port : clientPort;
  const urls = [
    `http://localhost:${appPort}`,
    ...lan.map((l) => `http://${l.address}:${appPort}`),
  ];
  // Toujours exposer aussi les URLs Vite en parallèle si on est en dual mode
  const viteUrls =
    !servingDist
      ? []
      : lan.map((l) => `http://${l.address}:${clientPort}`);
  return {
    port,
    clientPort,
    appPort,
    mode: servingDist ? 'production' : 'development',
    built,
    builtAt: built ? statSync(clientDist).mtimeMs : null,
    lan,
    urls: [...urls, ...viteUrls.filter((u) => !urls.includes(u))],
    desktopReady: existsSync(desktopPkg),
    ytdlp: existsSync(join(ROOT, 'bin', 'yt-dlp')),
    users: (db.prepare('SELECT COUNT(*) as c FROM users WHERE email NOT LIKE ?').get('%@local.ytmusic') as { c: number })
      .c,
    guests: (db.prepare('SELECT COUNT(*) as c FROM users WHERE email LIKE ?').get('%@local.ytmusic') as { c: number })
      .c,
    buildJob,
    tip: servingDist
      ? 'Prod : ouvre le domaine NPM ou les URLs ci-dessus'
      : 'Mobile LAN : même Wi‑Fi, ouvre une URL http://IP:5173 (QR Admin)',
  };
}

export function getBuildJob() {
  return buildJob;
}

export function startBuild() {
  if (buildJob.status === 'running') return buildJob;
  buildJob = { status: 'running', startedAt: Date.now(), log: '' };
  const child = spawn('npm', ['run', 'build'], {
    cwd: ROOT,
    shell: true,
    env: process.env,
  });
  child.stdout?.on('data', (d) => {
    buildJob.log += d.toString();
    if (buildJob.log.length > 20000) buildJob.log = buildJob.log.slice(-16000);
  });
  child.stderr?.on('data', (d) => {
    buildJob.log += d.toString();
    if (buildJob.log.length > 20000) buildJob.log = buildJob.log.slice(-16000);
  });
  child.on('close', (code) => {
    buildJob.status = code === 0 ? 'ok' : 'error';
    buildJob.finishedAt = Date.now();
  });
  return buildJob;
}
