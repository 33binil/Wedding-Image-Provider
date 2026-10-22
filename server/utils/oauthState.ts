import crypto from 'crypto';
import { env } from '../config/env.js';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStatePayload {
  /** Photographer (user) the OAuth flow is bound to. */
  uid: string;
  /** Random nonce guaranteeing uniqueness even within the same millisecond. */
  nonce: string;
  /** Issued-at timestamp (ms). */
  iat: number;
  /** Intended flow, prevents cross-flow state reuse. */
  purpose: 'google-drive-connect';
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', env.OAUTH_STATE_SECRET)
    .update(payload)
    .digest('base64url');
}

/**
 * Creates a cryptographically signed, tamper-evident OAuth state token.
 *
 * The payload is HMAC-SHA256 signed with OAUTH_STATE_SECRET, so an attacker
 * cannot forge a state that references another photographer account even if
 * they can read the cookie.
 */
export function createSignedState(uid: string): string {
  const payload: OAuthStatePayload = {
    uid,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: Date.now(),
    purpose: 'google-drive-connect',
  };

  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verifies and decodes a signed OAuth state token.
 * Throws when the signature is invalid, the payload is malformed, or the token expired.
 */
export function verifySignedState(state: string): OAuthStatePayload {
  if (typeof state !== 'string' || !state.includes('.')) {
    throw new Error('Malformed OAuth state');
  }

  const separatorIndex = state.lastIndexOf('.');
  const encoded = state.slice(0, separatorIndex);
  const signature = state.slice(separatorIndex + 1);

  if (!encoded || !signature) {
    throw new Error('Malformed OAuth state');
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature');
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed OAuth state payload');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Malformed OAuth state payload');
  }

  if (payload.purpose !== 'google-drive-connect') {
    throw new Error('Invalid OAuth state purpose');
  }

  if (!payload.uid || typeof payload.uid !== 'string') {
    throw new Error('Malformed OAuth state subject');
  }

  if (!Number.isFinite(payload.iat)) {
    throw new Error('Malformed OAuth state timestamp');
  }

  const age = Date.now() - payload.iat;
  if (age > STATE_TTL_MS) {
    throw new Error('OAuth state expired');
  }

  if (age < -60 * 1000) {
    throw new Error('OAuth state issued in the future');
  }

  return payload;
}

export const OAUTH_STATE_TTL_MS = STATE_TTL_MS;
