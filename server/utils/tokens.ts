import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type SessionType = 'PHOTOGRAPHER_SESSION' | 'SUPERADMIN_SESSION';

export interface TokenPayload {
  id: string;
  email: string;
  type: SessionType;
}

/**
 * Signs a photographer session.
 *
 * Photographer sessions are distinct from superadmin sessions by token type,
 * so a session token can never be replayed against the other surface even if
 * the cookie names were somehow confused.
 */
export function signPhotographerSession(payload: { id: string; email: string }): string {
  return jwt.sign(
    { ...payload, type: 'PHOTOGRAPHER_SESSION' as SessionType },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Signs a superadmin session. The lifetime matches the superadmin cookie.
 */
export function signSuperAdminSession(payload: { id: string; email: string }): string {
  return jwt.sign(
    { ...payload, type: 'SUPERADMIN_SESSION' as SessionType },
    env.JWT_SECRET,
    { expiresIn: '3d' }
  );
}

export function verifyPhotographerSession(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  if (payload.type !== 'PHOTOGRAPHER_SESSION') {
    throw new Error('This token is not a valid photographer session');
  }
  return payload;
}

export function verifySuperAdminSession(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  if (payload.type !== 'SUPERADMIN_SESSION') {
    throw new Error('This token is not a valid superadmin session');
  }
  return payload;
}
