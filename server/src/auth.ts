import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import type { Request, Response, NextFunction } from 'express';
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  publicUser,
  promoteAdminIfNeeded,
  type UserRow,
} from './db.js';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ytmusic-dev-secret-change-me',
);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export type AuthUser = ReturnType<typeof publicUser>;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userId?: string;
    }
  }
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  return prev.length === next.length && timingSafeEqual(prev, next);
}

export async function signToken(user: UserRow) {
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const id = String(payload.sub || '');
  const user = findUserById(id);
  if (!user) throw new Error('Utilisateur introuvable');
  return user;
}

export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const cookie = (req as any).cookies?.ytm_token as string | undefined;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookie;
  if (!token) return next();
  verifyToken(token)
    .then((user) => {
      req.user = publicUser(user);
      req.userId = user.id;
      next();
    })
    .catch(() => next());
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  authOptional(req, res, () => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentification requise' });
      return;
    }
    next();
  });
}

/** Ensure a user context: logged-in or auto local guest persisted via device id */
export function ensureUser(req: Request, res: Response, next: NextFunction) {
  authOptional(req, res, () => {
    if (req.userId) return next();

    const device =
      String(req.headers['x-device-id'] || '') ||
      String((req as any).cookies?.ytm_device || '') ||
      createHash('sha256').update(req.ip || 'local').digest('hex').slice(0, 24);

    const email = `guest-${device}@local.ytmusic`;
    let user = findUserByEmail(email);
    if (!user) {
      user = createUser({
        email,
        name: 'Invité',
        passwordHash: hashPassword(randomBytes(8).toString('hex')),
      });
    }
    req.user = publicUser(user);
    req.userId = user.id;
    res.cookie('ytm_device', device, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: false });
    next();
  });
}

export async function registerLocal(email: string, password: string, name: string) {
  if (findUserByEmail(email)) throw new Error('Email déjà utilisé');
  const user = createUser({
    email,
    name: name || email.split('@')[0],
    passwordHash: hashPassword(password),
  });
  promoteAdminIfNeeded(email);
  const refreshed = findUserByEmail(email) || user;
  const token = await signToken(refreshed);
  return { user: publicUser(refreshed), token };
}

export async function loginLocal(email: string, password: string) {
  const user = findUserByEmail(email);
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    throw new Error('Identifiants invalides');
  }
  const token = await signToken(user);
  return { user: publicUser(user), token };
}

export async function loginGoogle(idToken: string) {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth non configuré (GOOGLE_CLIENT_ID manquant)');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) throw new Error('Token Google invalide');

  let user = findUserByGoogleId(payload.sub) || findUserByEmail(payload.email);
  if (!user) {
    user = createUser({
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
      googleId: payload.sub,
    });
  } else if (!user.google_id) {
    // link account — simple update
    const { db } = await import('./db.js');
    db.prepare('UPDATE users SET google_id = ?, picture = COALESCE(?, picture), updated_at = ? WHERE id = ?').run(
      payload.sub,
      payload.picture || null,
      Date.now(),
      user.id,
    );
    user = findUserById(user.id)!;
  }

  const token = await signToken(user);
  return { user: publicUser(user), token };
}

export function authConfig() {
  return {
    googleClientId: GOOGLE_CLIENT_ID || null,
    googleEnabled: Boolean(GOOGLE_CLIENT_ID),
  };
}
