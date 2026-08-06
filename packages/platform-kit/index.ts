/**
 * Platform Kit — socle réutilisable (déploiement / auth multi-env / télémétrie)
 * ================================================================
 * Copiable dans d’autres projets. Ne dépend pas de la logique métier PLM.
 *
 * Contenu typique à réutiliser :
 * - compose Portainer + réseaux NPM externes
 * - variables APP_ENV / APP_URL / SMTP / JWT / WEBAUTHN
 * - schéma refresh tokens + email verify + telemetry (voir server/src/platform.ts)
 * - bannière d’install PWA conditionnelle
 *
 * Envs :
 * - local       → APP_ENV=local      APP_URL=http://localhost:5173
 * - preprod     → APP_ENV=preprod    APP_URL=https://ytmusic-preprod.delhomme.ovh
 * - production  → APP_ENV=production APP_URL=https://ytmusic.delhomme.ovh
 */

export const PLATFORM_ENVS = ['local', 'preprod', 'production'] as const;
export type PlatformEnv = (typeof PLATFORM_ENVS)[number];

export function detectEnv(explicit?: string): PlatformEnv {
  const v = (explicit || process.env.APP_ENV || '').toLowerCase();
  if (v === 'preprod' || v === 'staging') return 'preprod';
  if (v === 'production' || v === 'prod') return 'production';
  return 'local';
}

export const REQUIRED_PROD_ENV = [
  'JWT_SECRET',
  'APP_URL',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_ORIGIN',
] as const;
