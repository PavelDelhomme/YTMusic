import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppEnv } from './mail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'admin-deploy-prod.sh');

export type DeployMode = 'web' | 'apk' | 'all';

let deployJob: {
  status: 'idle' | 'running' | 'ok' | 'error';
  mode?: DeployMode;
  startedAt?: number;
  finishedAt?: number;
  log: string;
} = { status: 'idle', log: '' };

export function getDeployJob() {
  return { ...deployJob };
}

export function deployAllowedFromThisHost() {
  const env = getAppEnv();
  if (env === 'local') return true;
  return process.env.ALLOW_REMOTE_ADMIN_DEPLOY === '1';
}

export function startAdminDeploy(mode: DeployMode) {
  if (!deployAllowedFromThisHost()) {
    throw new Error('Déploiement Admin uniquement depuis APP_ENV=local (ton PC)');
  }
  if (deployJob.status === 'running') return getDeployJob();
  if (!['web', 'apk', 'all'].includes(mode)) {
    throw new Error('mode invalide (web|apk|all)');
  }

  deployJob = {
    status: 'running',
    mode,
    startedAt: Date.now(),
    log: `==> admin-deploy-prod.sh ${mode}\n`,
  };

  const child = spawn('bash', [SCRIPT, mode], {
    cwd: ROOT,
    env: {
      ...process.env,
      // Force local gate even if .env was overridden oddly
      APP_ENV: process.env.APP_ENV || 'local',
    },
  });

  const append = (chunk: Buffer | string) => {
    deployJob.log += chunk.toString();
    if (deployJob.log.length > 80_000) deployJob.log = deployJob.log.slice(-64_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.on('close', (code) => {
    deployJob.status = code === 0 ? 'ok' : 'error';
    deployJob.finishedAt = Date.now();
    deployJob.log += `\n==> exit ${code}\n`;
  });
  child.on('error', (err) => {
    deployJob.status = 'error';
    deployJob.finishedAt = Date.now();
    deployJob.log += `\n${String(err)}\n`;
  });

  return getDeployJob();
}

export function deployAdminHints() {
  const prodUrl = (process.env.DEPLOY_URL || process.env.PROD_APP_URL || 'https://ytmusic.delhomme.ovh').replace(
    /\/$/,
    '',
  );
  return {
    allowed: deployAllowedFromThisHost(),
    appEnv: getAppEnv(),
    prodUrl,
    portainerWebhookConfigured: Boolean((process.env.PORTAINER_WEBHOOK_URL || '').trim()),
    job: getDeployJob(),
  };
}
