/**
 * AUTOMATED TEST SUITE — Firebase Authentication (Google Sign-In)
 *
 * Scope of these tests:
 *   - Firebase ID token verification (valid / invalid / missing)
 *   - Provider and verified-email enforcement
 *   - First-time sign-in creating a photographer record
 *   - Returning-user sign-in reusing the same record
 *   - Linking a legacy (password-era) account to a Firebase UID
 *   - Refusing to merge two Google accounts onto one mailbox
 *   - Never granting SUPERADMIN to a Google account
 *   - Suspended photographers being blocked from signing in
 *   - Session token separation between photographer and superadmin surfaces
 *   - Removal of the password / OTP endpoints
 *
 * The Firebase ID token verifier is replaced with a deterministic stub (see
 * `setIdTokenVerifier`). These tests therefore verify OUR identity-linking
 * logic, NOT Firebase itself. A real end-to-end Firebase verification
 * requires live credentials — see the README section on manual verification.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  startTestDatabase,
  stopTestDatabase,
  clearCollections,
  createPhotographer,
} from './helpers.js';
import { setIdTokenVerifier } from '../services/firebaseAuth.service.js';
import {
  signSuperAdminSession,
  signPhotographerSession,
  verifySuperAdminSession,
  verifyPhotographerSession,
} from '../utils/tokens.js';
import { Photographer } from '../models/Photographer.js';
import { Invitation } from '../models/Invitation.js';
import { createApp } from '../app.js';

const app = createApp();

let server: any;
let baseUrl: string;

async function listen(): Promise<void> {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${(address as any).port}`;
}

async function close(): Promise<void> {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function call(
  method: string,
  url: string,
  options: { cookie?: string; body?: any; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;

  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    redirect: 'manual',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: res.status,
    headers: res.headers,
    setCookie: res.headers.get('set-cookie') || '',
    data,
  };
}

/**
 * Installs a deterministic ID token verifier.
 * `token` is the exact string the client sends; the map holds the identity
 * that "Firebase" would have verified.
 */
function useFakeFirebase(tokens: Record<string, any>) {
  setIdTokenVerifier(async (idToken: string) => {
    const identity = tokens[idToken];
    if (!identity) {
      const error: any = new Error('Firebase ID token could not be verified');
      error.code = 'auth/invalid-id-token';
      throw error;
    }
    return identity;
  });
}

const GOOGLE_IDENTITY = {
  uid: 'firebase-uid-alice',
  email: 'alice@example.com',
  emailVerified: true,
  name: 'Alice Studio',
  provider: 'google.com',
};

before(async () => {
  await startTestDatabase();
  await listen();
});

after(async () => {
  await close();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearCollections();
  setIdTokenVerifier(null);
});

// ---------------------------------------------------------------------------
// 1. Firebase configuration
// ---------------------------------------------------------------------------
describe('Firebase configuration endpoint', () => {
  it('reports the server configuration state without leaking secrets', async () => {
    const res = await call('GET', '/api/auth/firebase-config');

    assert.equal(res.status, 200);
    assert.ok('configured' in res.data.data);

    const serialized = JSON.stringify(res.data);
    assert.ok(!serialized.includes('private_key'));
    assert.ok(!serialized.includes('privateKey'));
    assert.ok(!serialized.includes('serviceAccount'));
    assert.ok(!serialized.includes('client_email'));
  });

  it('does not distribute the web configuration (the frontend uses VITE_ vars)', async () => {
    const res = await call('GET', '/api/auth/firebase-config');

    // The browser reads its own configuration from VITE_FIREBASE_* variables,
    // so the backend must not ship a second copy of the web config.
    assert.equal(res.data.data.webConfig, undefined);
    assert.equal(res.data.data.apiKey, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. ID token verification
// ---------------------------------------------------------------------------
describe('Firebase ID token verification', () => {
  it('rejects a sign-in attempt with no token', async () => {
    const res = await call('POST', '/api/auth/google', { body: {} });

    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'MISSING_ID_TOKEN');
  });

  it('reports that Firebase is not configured on the server', async () => {
    // The real verifier is in use and the test environment has no Firebase
    // service-account credentials.
    setIdTokenVerifier(null);

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'any-token-that-is-long-enough-to-pass-validation' },
    });

    assert.equal(res.status, 503);
    assert.ok(
      res.data.error === 'FIREBASE_NOT_CONFIGURED' ||
        res.data.error === 'FIREBASE_MISCONFIGURED'
    );
  });

  it('rejects a token the Admin SDK cannot verify', async () => {
    useFakeFirebase({});

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'not-a-valid-firebase-token-value' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'INVALID_ID_TOKEN');
  });

  it('rejects a token from a non-Google provider', async () => {
    useFakeFirebase({
      'phone-token': {
        uid: 'uid-1',
        email: 'a@example.com',
        emailVerified: true,
        provider: 'phone',
      },
    });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'phone-token' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'UNSUPPORTED_PROVIDER');
  });

  it('rejects a token whose email is not verified', async () => {
    useFakeFirebase({
      'unverified-token': {
        uid: 'uid-1',
        email: 'a@example.com',
        emailVerified: false,
        provider: 'google.com',
      },
    });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'unverified-token' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'UNVERIFIED_EMAIL');
  });

  it('rejects a token with no email at all', async () => {
    useFakeFirebase({
      'no-email-token': {
        uid: 'uid-1',
        email: '',
        emailVerified: true,
        provider: 'google.com',
      },
    });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'no-email-token' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'MISSING_EMAIL');
  });

  it('ignores client-supplied email, uid and role', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: {
        idToken: 'good-token',
        // A malicious client tries to inject its own identity.
        email: 'attacker@evil.com',
        uid: 'attacker-uid',
        role: 'SUPERADMIN',
        status: 'ACTIVE',
      },
    });

    assert.equal(res.status, 200);

    // The stored identity comes from the VERIFIED token only.
    const stored = await Photographer.findOne({ email: 'alice@example.com' });
    assert.ok(stored);
    assert.equal(stored!.firebaseUid, 'firebase-uid-alice');
    assert.equal(stored!.role, 'PHOTOGRAPHER');

    // No account was created for the attacker-supplied identity.
    const injected = await Photographer.findOne({ email: 'attacker@evil.com' });
    assert.equal(injected, null);
  });
});

// ---------------------------------------------------------------------------
// 3. First-time sign-in / returning user / linking
// ---------------------------------------------------------------------------
describe('Photographer account resolution', () => {
  it('creates a photographer record on first Google sign-in', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.firstSignIn, true);
    assert.equal(res.data.data.needsDriveSetup, true);
    assert.equal(res.data.data.user.email, 'alice@example.com');
    assert.equal(res.data.data.user.role, 'PHOTOGRAPHER');
    assert.equal(res.data.data.user.status, 'ACTIVE');

    // A session cookie is issued.
    assert.match(res.setCookie, /wedding_auth_token=/);
    assert.match(res.setCookie, /HttpOnly/);

    // The record is persisted with the Firebase UID.
    const stored = await Photographer.findOne({ firebaseUid: 'firebase-uid-alice' });
    assert.ok(stored);
    assert.equal(stored!.email, 'alice@example.com');
    assert.equal(stored!.name, 'Alice Studio');
    assert.ok(stored!.trialExpiresAt, 'a trial period must be set');
  });

  it('reuses the same record for a returning user', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    await call('POST', '/api/auth/google', { body: { idToken: 'good-token' } });
    const res = await call('POST', '/api/auth/google', { body: { idToken: 'good-token' } });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.firstSignIn, false);

    const count = await Photographer.countDocuments({ firebaseUid: 'firebase-uid-alice' });
    assert.equal(count, 1);
  });

  it('links a legacy account that has no Firebase UID yet', async () => {
    // A record created before the Firebase migration (no firebaseUid).
    const legacy = await Photographer.create({
      name: 'Legacy Studio',
      email: 'alice@example.com',
      role: 'PHOTOGRAPHER',
      status: 'ACTIVE',
      trialStartAt: new Date(),
      trialExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      googleDrive: { connected: false },
    });
    const legacyId = legacy._id.toString();

    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.firstSignIn, false);
    assert.equal(res.data.data.user._id, legacyId);

    // The SAME record was reused and linked — no duplicate was created.
    const count = await Photographer.countDocuments({ email: 'alice@example.com' });
    assert.equal(count, 1);

    const linked = await Photographer.findById(legacyId);
    assert.equal(linked!.firebaseUid, 'firebase-uid-alice');
    assert.ok(linked!.firebaseLinkedAt);
  });

  it('sign-in succeeds with needsDriveSetup=true regardless of Drive OAuth config', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    // Sign-in succeeds regardless of Drive configuration.
    assert.equal(res.status, 200);
    assert.equal(res.data.data.firstSignIn, true);
    assert.equal(res.data.data.needsDriveSetup, true);
    assert.match(res.setCookie, /wedding_auth_token=/);

    // When Drive OAuth credentials ARE configured, the connect endpoint returns
    // a redirect (302) — the frontend only navigates there when the user clicks
    // "Connect Google Drive" on the dashboard, never automatically after login.
    const connectRes = await call('GET', '/api/integrations/google-drive/connect', {
      cookie: res.setCookie,
    });
    assert.equal(connectRes.status, 302);
  });

  it('refuses to merge two different Google accounts onto one mailbox', async () => {
    // The mailbox is already bound to a different Google account.
    await Photographer.create({
      name: 'Existing Studio',
      email: 'alice@example.com',
      firebaseUid: 'firebase-uid-someone-else',
      role: 'PHOTOGRAPHER',
      status: 'ACTIVE',
      googleDrive: { connected: false },
    });

    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'ACCOUNT_LINK_CONFLICT');

    // The original binding is untouched.
    const stored = await Photographer.findOne({ email: 'alice@example.com' });
    assert.equal(stored!.firebaseUid, 'firebase-uid-someone-else');
  });

  it('never grants SUPERADMIN to a Google account', async () => {
    useFakeFirebase({
      'good-token': {
        uid: 'firebase-uid-admin',
        email: 'pentaprizmofficial@gmail.com',
        emailVerified: true,
        name: 'Impostor',
        provider: 'google.com',
      },
    });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    // A NEW record may be created, but it is never a superadmin.
    const stored = await Photographer.findOne({ firebaseUid: 'firebase-uid-admin' });
    if (stored) {
      assert.equal(stored.role, 'PHOTOGRAPHER');
    }

    if (res.status === 200) {
      assert.equal(res.data.data.user.role, 'PHOTOGRAPHER');
    }
  });

  it('refuses to let a Google sign-in take over the superadmin account', async () => {
    await Photographer.create({
      name: 'Penta Prizm Admin',
      email: 'admin@example.com',
      passwordHash: 'some-hash',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      googleDrive: { connected: false },
    });

    useFakeFirebase({
      'good-token': {
        uid: 'firebase-uid-x',
        email: 'admin@example.com',
        emailVerified: true,
        provider: 'google.com',
      },
    });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'RESERVED_ACCOUNT');

    const stored = await Photographer.findOne({ email: 'admin@example.com' });
    assert.equal(stored!.role, 'SUPERADMIN');
    assert.equal(stored!.firebaseUid, undefined);
  });

  it('consumes a pending invitation and applies its trial length', async () => {
    await Invitation.create({
      email: 'alice@example.com',
      studioName: 'Alice Studio',
      codeHash: 'hash',
      status: 'PENDING',
      trialDays: 60,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      trialExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });

    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 200);

    const stored = await Photographer.findOne({ firebaseUid: 'firebase-uid-alice' });
    const expectedExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    // Within a generous window of the invitation's trial expiry.
    assert.ok(
      Math.abs(stored!.trialExpiresAt!.getTime() - expectedExpiry.getTime()) < 60_000
    );

    const invitation = await Invitation.findOne({ email: 'alice@example.com' });
    assert.equal(invitation!.status, 'ACCEPTED');
  });
});

// ---------------------------------------------------------------------------
// 4. Suspended accounts and session separation
// ---------------------------------------------------------------------------
describe('Suspended accounts and session separation', () => {
  it('blocks a suspended photographer from signing in', async () => {
    await createPhotographer({
      email: 'alice@example.com',
      firebaseUid: 'firebase-uid-alice',
      status: 'SUSPENDED',
    });

    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'ACCOUNT_SUSPENDED');
    assert.ok(!res.setCookie.includes('wedding_auth_token='));
  });

  it('rejects a superadmin session on photographer endpoints', async () => {
    const admin = await Photographer.create({
      name: 'Penta Prizm Admin',
      email: `admin_${Date.now()}@example.com`,
      passwordHash: 'hash',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      googleDrive: { connected: false },
    });

    const adminToken = signSuperAdminSession({
      id: admin._id.toString(),
      email: admin.email,
    });

    const res = await call('GET', '/api/auth/me', {
      cookie: `wedding_auth_token=${adminToken}`,
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'INVALID_TOKEN');
  });

  it('rejects a photographer session on superadmin endpoints', async () => {
    const photographer = await createPhotographer();

    // Via the photographer cookie: the superadmin surface has no session.
    const viaCookie = await call('GET', '/api/superadmin/auth/me', {
      cookie: photographer.cookie,
    });
    assert.equal(viaCookie.status, 401);
    assert.equal(viaCookie.data.error, 'SUPERADMIN_UNAUTHORIZED');

    // Via the Authorization header: the photographer JWT is not a superadmin
    // session token, so it is rejected outright.
    const viaHeader = await call('GET', '/api/superadmin/auth/me', {
      headers: { Authorization: `Bearer ${photographer.sessionToken}` },
    });
    assert.equal(viaHeader.status, 401);
    assert.equal(viaHeader.data.error, 'INVALID_SUPERADMIN_TOKEN');
  });

  it('issues a session that the photographer endpoints accept', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const signIn = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    const cookie = signIn.setCookie.split(';')[0];

    const me = await call('GET', '/api/auth/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.data.user.email, 'alice@example.com');

    const onboarding = await call('GET', '/api/auth/onboarding', { cookie });
    assert.equal(onboarding.status, 200);
    assert.equal(onboarding.data.data.needsDriveSetup, true);
    assert.equal(onboarding.data.data.driveConnected, false);
  });

  it('never returns the Firebase UID or a session secret to the client', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    const res = await call('POST', '/api/auth/google', {
      body: { idToken: 'good-token' },
    });

    const userPayload = JSON.stringify(res.data.data.user);
    assert.ok(!userPayload.includes('firebaseUid'));
    assert.ok(!userPayload.includes('firebase-uid-alice'));
  });
});

// ---------------------------------------------------------------------------
// 5. Removal of the obsolete password / OTP flows
// ---------------------------------------------------------------------------
describe('Obsolete password and OTP endpoints are removed', () => {
  it('no longer exposes the password registration route', async () => {
    const res = await call('POST', '/api/auth/register', {
      body: {
        name: 'Legacy',
        email: 'legacy@example.com',
        password: 'StudioPassword2026!',
        confirmPassword: 'StudioPassword2026!',
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'NOT_FOUND');
  });

  it('no longer exposes the password login route', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: 'StudioPassword2026!' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'NOT_FOUND');
  });

  it('no longer exposes the OTP verification route', async () => {
    const res = await call('POST', '/api/auth/verify-login-otp', {
      body: { otp: '123456' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'NOT_FOUND');
  });

  it('no longer exposes the superadmin OTP generation route', async () => {
    const admin = await Photographer.create({
      name: 'Penta Prizm Admin',
      email: `admin_${Date.now()}@example.com`,
      passwordHash: 'hash',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      googleDrive: { connected: false },
    });

    const adminToken = signSuperAdminSession({
      id: admin._id.toString(),
      email: admin.email,
    });

    const res = await call('POST', `/api/superadmin/photographers/${admin._id}/login-otp`, {
      cookie: `penta_superadmin_token=${adminToken}`,
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'NOT_FOUND');
  });

  it('does not store a password hash for Firebase accounts', async () => {
    useFakeFirebase({ 'good-token': GOOGLE_IDENTITY });

    await call('POST', '/api/auth/google', { body: { idToken: 'good-token' } });

    const stored = await Photographer.findOne({ firebaseUid: 'firebase-uid-alice' });
    assert.equal(stored!.passwordHash, undefined);
  });
});

// ---------------------------------------------------------------------------
// 6. Session token helpers
// ---------------------------------------------------------------------------
describe('Session token separation', () => {
  it('rejects a photographer token where a superadmin token is required', () => {
    const token = signPhotographerSession({ id: 'abc', email: 'a@example.com' });
    assert.throws(() => verifySuperAdminSession(token));
  });

  it('rejects a superadmin token where a photographer token is required', () => {
    const token = signSuperAdminSession({ id: 'abc', email: 'a@example.com' });
    assert.throws(() => verifyPhotographerSession(token));
  });
});
