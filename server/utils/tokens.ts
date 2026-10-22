import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  id: string;
  email: string;
  type?: 'SESSION' | 'PRE_AUTH';
}

export function signToken(payload: { id: string; email: string }): string {
  return jwt.sign({ ...payload, type: 'SESSION' }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function signPreAuthToken(payload: { id: string; email: string }): string {
  return jwt.sign({ ...payload, type: 'PRE_AUTH' }, env.JWT_SECRET, {
    expiresIn: '10m', // 10 minutes short-lived restricted session
  });
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  if (payload.type === 'PRE_AUTH') {
    throw new Error('Pre-authentication token cannot be used as an authenticated session token');
  }
  return payload;
}

export function verifyPreAuthToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  if (payload.type !== 'PRE_AUTH') {
    throw new Error('Invalid pre-authentication token type');
  }
  return payload;
}
