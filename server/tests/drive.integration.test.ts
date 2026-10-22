/**
 * AUTOMATED TEST SUITE — Google Drive integration
 *
 * Scope of these tests:
 *   - OAuth state signing/verification (CSRF, cross-user binding, expiry)
 *   - Callback handling for invalid/malformed callbacks
 *   - Event creation with Drive connected / disconnected
 *   - Folder creation, idempotency and duplicate prevention
 *   - Retry after partial failure (no duplicate folders, no duplicate events)
 *   - Expired / revoked access tokens (invalid_grant) -> reconnect required
 *   - Refresh token encryption + rotation persistence
 *   - Cross-photographer access denial on every Drive endpoint
 *   - MongoDB persistence of Drive metadata
 *
 * These tests use a REAL MongoDB (embedded mongod) and a FAKE Google Drive
 * client. They prove the application's integration logic. They do NOT prove
 * that Google itself works — see `server/scripts/verifyGoogleDriveLive.ts`
 * for the real end-to-end check.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { startTestDatabase, stopTestDatabase, clearCollections, createPhotographer } from './helpers.js';
import { FakeDrive, invalidGrantError } from './fakeDrive.js';
import {
  setDriveClientFactory,
  getDriveClientForPhotographer,
  persistRotatedRefreshToken,
} from '../services/drive.service.js';
import { createSignedState, verifySignedState } from '../utils/oauthState.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { Photographer } from '../models/Photographer.js';
import { Event } from '../models/Event.js';
import { createApp } from '../app.js';
import { env } from '../config/env.js';

/**
 * Signs an arbitrary payload with the real OAuth state secret so that only the
 * specific validation rule under test can cause the verification to fail.
 */
function signPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.OAUTH_STATE_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

const app = createApp();

let server: any;
let baseUrl: string;

async function listen(): Promise<void> {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function close(): Promise<void> {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * Minimal cookie-aware fetch helper so we can assert on Set-Cookie behaviour.
 */
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
  setDriveClientFactory(null);
});

/**
 * Installs a fake Drive client and returns it for assertions.
 */
function useFakeDrive(fake: FakeDrive) {
  setDriveClientFactory(async () => ({ drive: fake.client, oauth2Client: {} }));
  return fake;
}

// ---------------------------------------------------------------------------
// 1. OAuth state validation
// ---------------------------------------------------------------------------
describe('OAuth state validation', () => {
  it('creates a state bound to the given photographer', () => {
    const state = createSignedState('photographer-abc');
    const payload = verifySignedState(state);
    assert.equal(payload.uid, 'photographer-abc');
    assert.equal(payload.purpose, 'google-drive-connect');
    assert.ok(payload.nonce.length >= 16);
  });

  it('rejects a state whose payload was tampered with', () => {
    const state = createSignedState('photographer-abc');
    const [payload] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ uid: 'attacker', nonce: 'x', iat: Date.now(), purpose: 'google-drive-connect' })
    ).toString('base64url');

    assert.throws(() => verifySignedState(`${forged}.${state.split('.')[1]}`), /Invalid OAuth state signature/);
    assert.ok(payload.length > 0);
  });

  it('rejects a state signed with a different secret', () => {
    const state = createSignedState('photographer-abc');
    const [payload, signature] = state.split('.');
    const forgedSignature = Buffer.from('not-the-right-signature-at-all').toString('base64url');
    assert.throws(() => verifySignedState(`${payload}.${forgedSignature}`), /Invalid OAuth state signature/);
    assert.ok(signature.length > 0);
  });

  it('rejects an expired state', () => {
    const expired = signPayload({
      uid: 'photographer-abc',
      nonce: 'abcdefabcdefabcdef',
      iat: Date.now() - 11 * 60 * 1000,
      purpose: 'google-drive-connect',
    });

    assert.throws(() => verifySignedState(expired), /expired/);
  });

  it('rejects a malformed state', () => {
    assert.throws(() => verifySignedState('not-a-state'), /Malformed OAuth state/);
    assert.throws(() => verifySignedState('a.b.c'), /Invalid OAuth state signature/);
  });

  it('rejects a state issued for a different purpose', () => {
    const wrongPurpose = signPayload({
      uid: 'photographer-abc',
      nonce: 'abcdefabcdefabcdef',
      iat: Date.now(),
      purpose: 'some-other-flow',
    });

    assert.throws(() => verifySignedState(wrongPurpose), /Invalid OAuth state purpose/);
  });
});

// ---------------------------------------------------------------------------
// 2. OAuth callback handling
// ---------------------------------------------------------------------------
describe('Google Drive OAuth callback', () => {
  it('rejects a callback with missing code/state', async () => {
    const res = await call('GET', '/api/integrations/google-drive/callback');
    assert.equal(res.status, 302);
    assert.match(String(res.headers.get('location')), /drive_error=missing_params/);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const photographer = await createPhotographer();
    const state = createSignedState(photographer.id);

    // Cookie holds a different (valid but unrelated) state.
    const otherState = createSignedState('someone-else');

    const res = await call('GET', `/api/integrations/google-drive/callback?code=abc&state=${encodeURIComponent(state)}`, {
      cookie: `wedding_oauth_state=${encodeURIComponent(otherState)}`,
    });

    assert.equal(res.status, 302);
    assert.match(String(res.headers.get('location')), /drive_error=invalid_state/);
  });

  it('rejects a callback that is missing the PKCE code verifier', async () => {
    const photographer = await createPhotographer();
    const state = createSignedState(photographer.id);

    // The state matches, but the PKCE verifier cookie is missing — the
    // authorization code cannot be redeemed.
    const res = await call(
      'GET',
      `/api/integrations/google-drive/callback?code=abc&state=${encodeURIComponent(state)}`,
      { cookie: `wedding_oauth_state=${encodeURIComponent(state)}` }
    );

    assert.equal(res.status, 302);
    assert.match(String(res.headers.get('location')), /drive_error=invalid_state/);
  });

  it('rejects a callback with a forged (unsigned) state', async () => {
    const photographer = await createPhotographer();
    const forged = Buffer.from(
      JSON.stringify({ uid: photographer.id, nonce: 'x', iat: Date.now(), purpose: 'google-drive-connect' })
    ).toString('base64url');

    const res = await call(
      'GET',
      `/api/integrations/google-drive/callback?code=abc&state=${encodeURIComponent(forged)}.forged`,
      { cookie: `wedding_oauth_state=${encodeURIComponent(forged)}.forged` }
    );

    assert.equal(res.status, 302);
    assert.match(String(res.headers.get('location')), /drive_error=invalid_state/);
  });

  it('rejects a callback when the photographer no longer exists', async () => {
    const state = createSignedState('507f1f77bcf86cd799439011');
    const res = await call(
      'GET',
      `/api/integrations/google-drive/callback?code=abc&state=${encodeURIComponent(state)}`,
      {
        cookie:
          `wedding_oauth_state=${encodeURIComponent(state)}; ` +
          'wedding_oauth_pkce=test-code-verifier',
      }
    );

    assert.equal(res.status, 302);
    assert.match(String(res.headers.get('location')), /drive_error=user_not_found/);
  });

  it('requires authentication to start the OAuth flow', async () => {
    const res = await call('GET', '/api/integrations/google-drive/connect');
    assert.equal(res.status, 401);
  });

  it('redirects back to a relative path when CLIENT_URL is not explicitly set', async () => {
    // A production deployment without CLIENT_URL must not bounce the
    // photographer to localhost:3000.
    assert.equal(env.CLIENT_URL_EXPLICIT, false);

    const res = await call('GET', '/api/integrations/google-drive/callback');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard?drive_error=missing_params');
  });

  it('returns the connection status for an authenticated photographer', async () => {
    const photographer = await createPhotographer();
    const res = await call('GET', '/api/integrations/google-drive/status', {
      cookie: photographer.cookie,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.data.connected, false);
    // The test environment supplies placeholder Google credentials, so the
    // server reports itself as configured.
    assert.equal(res.data.data.configured, true);
    // The exact callback URI is surfaced so administrators can register it
    // verbatim in the Google Cloud Console.
    assert.equal(
      res.data.data.redirectUri,
      'http://localhost:3000/api/integrations/google-drive/callback'
    );
  });

  it('never exposes refresh tokens or access tokens in the status payload', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        googleEmail: 'photo@example.com',
        refreshTokenEncrypted: encrypt('super-secret-refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('GET', '/api/integrations/google-drive/status', {
      cookie: photographer.cookie,
    });

    const serialized = JSON.stringify(res.data);
    assert.ok(!serialized.includes('super-secret-refresh-token'));
    assert.ok(!serialized.includes(photographer.sessionToken));
    assert.equal(res.data.data.googleEmail, 'photo@example.com');
    assert.equal(res.data.data.connected, true);
  });

  it('never exposes refresh tokens through the photographer profile endpoint', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        googleEmail: 'photo@example.com',
        refreshTokenEncrypted: encrypt('super-secret-refresh-token'),
      },
    });

    const res = await call('GET', '/api/auth/me', { cookie: photographer.cookie });
    const serialized = JSON.stringify(res.data);
    assert.ok(!serialized.includes('super-secret-refresh-token'));
    assert.ok(!serialized.includes('refreshTokenEncrypted'));
  });
});

// ---------------------------------------------------------------------------
// 3. Refresh token encryption
// ---------------------------------------------------------------------------
describe('Refresh token encryption', () => {
  it('round-trips a refresh token through AES-256-GCM', () => {
    const token = '1//0gRefreshTokenValue';
    const encrypted = encrypt(token);
    assert.notEqual(encrypted, token);
    assert.ok(!encrypted.includes(token));
    assert.equal(decrypt(encrypted), token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const token = 'same-token';
    assert.notEqual(encrypt(token), encrypt(token));
  });

  it('fails to decrypt a tampered ciphertext', () => {
    const encrypted = encrypt('token-value');
    const parts = encrypted.split(':');
    parts[2] = parts[2].replace(/^../, 'ff');
    assert.throws(() => decrypt(parts.join(':')));
  });

  it('persists a rotated refresh token atomically', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('original-refresh-token'),
        connectedAt: new Date(),
      },
    });

    // Google rotating the refresh token must be persisted without losing it.
    await persistRotatedRefreshToken(photographer.id, 'rotated-refresh-token');

    const after = await Photographer.findById(photographer.id);
    assert.equal(
      decrypt(after!.googleDrive.refreshTokenEncrypted!),
      'rotated-refresh-token'
    );
    assert.equal(after!.googleDrive.reconnectRequired, false);
    assert.equal(after!.googleDrive.connected, true);
  });

  it('does not let a concurrent update revert a rotated refresh token', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('original-refresh-token'),
        connectedAt: new Date(),
      },
    });

    await persistRotatedRefreshToken(photographer.id, 'rotated-refresh-token');

    // A later unrelated update to the same document must not clobber the
    // rotated token (the write path uses a targeted $set, not a full save).
    await Photographer.updateOne(
      { _id: photographer.id },
      { $set: { name: 'Renamed Studio' } }
    );

    const after = await Photographer.findById(photographer.id);
    assert.equal(after!.name, 'Renamed Studio');
    assert.equal(
      decrypt(after!.googleDrive.refreshTokenEncrypted!),
      'rotated-refresh-token'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Event creation with Drive disconnected
// ---------------------------------------------------------------------------
describe('Event creation with Google Drive disconnected', () => {
  it('creates the event successfully and reports the Drive message', async () => {
    const photographer = await createPhotographer();

    const res = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: {
        title: 'Aarav & Diya Wedding',
        eventDate: '2026-12-12',
        venue: 'Taj Palace',
      },
    });

    assert.equal(res.status, 201);
    assert.match(res.data.data.driveMessage, /Connect Google Drive/i);
    assert.equal(res.data.data.event.driveFolderStatus, 'NOT_CONNECTED');
    assert.equal(res.data.data.event.driveFolderId, undefined);

    // Persisted in MongoDB.
    const persisted = await Event.findById(res.data.data.event._id);
    assert.equal(persisted!.title, 'Aarav & Diya Wedding');
    assert.equal(persisted!.driveFolderStatus, 'NOT_CONNECTED');
  });

  it('refuses to retry folder creation when Drive is disconnected', async () => {
    const photographer = await createPhotographer();
    const created = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'No Drive Wedding', eventDate: '2026-12-12' },
    });

    const res = await call('POST', `/api/events/${created.data.data.event._id}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'DRIVE_NOT_CONNECTED');
  });
});

// ---------------------------------------------------------------------------
// 5. Folder creation, idempotency and duplicate prevention
// ---------------------------------------------------------------------------
describe('Automatic Drive folder creation', () => {
  it('creates the parent app folder and the event folder', async () => {
    const fake = useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        googleEmail: 'photo@example.com',
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Aarav & Diya Wedding', eventDate: '2026-12-12' },
    });

    assert.equal(res.status, 201);
    assert.match(res.data.data.driveMessage, /created automatically/i);

    const event = res.data.data.event;
    assert.equal(event.driveFolderStatus, 'CREATED');
    assert.ok(event.driveFolderId);
    assert.ok(event.driveFolderWebViewLink);
    assert.equal(event.driveConnectionStatus, 'CONNECTED');

    // One root folder + one event folder.
    assert.equal(fake.countRootFolders(), 1);
    assert.equal(fake.countEventFolders(), 1);

    // The root folder is named as specified.
    const root = fake.files.find((f) => !f.appProperties?.eventId)!;
    assert.equal(root.name, 'Wedding AI Photo Finder');
  });

  it('persists the folder id and link in MongoDB', async () => {
    useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Persistence Wedding', eventDate: '2026-12-12' },
    });

    const persisted = await Event.findById(res.data.data.event._id);
    assert.ok(persisted!.driveFolderId);
    assert.ok(persisted!.driveFolderWebViewLink);
    assert.equal(persisted!.driveFolderStatus, 'CREATED');
    assert.ok(persisted!.driveFolderCreatedAt);
  });

  it('does not create a second folder when folder creation is retried', async () => {
    const fake = useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const created = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Idempotent Wedding', eventDate: '2026-12-12' },
    });
    const eventId = created.data.data.event._id;

    const retry = await call('POST', `/api/events/${eventId}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });

    assert.equal(retry.status, 200);
    assert.equal(retry.data.data.event.driveFolderId, created.data.data.event.driveFolderId);

    // Still exactly one event folder — the retry reused the existing one.
    assert.equal(fake.countEventFolders(), 1);
  });

  it('does not create a duplicate event when retrying folder creation', async () => {
    useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const created = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'No Duplicate Wedding', eventDate: '2026-12-12' },
    });

    await call('POST', `/api/events/${created.data.data.event._id}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });
    await call('POST', `/api/events/${created.data.data.event._id}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });

    const count = await Event.countDocuments({ photographerId: photographer.id });
    assert.equal(count, 1);
  });

  it('creates distinct folders for two events with the same title', async () => {
    const fake = useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const first = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Smith Wedding', eventDate: '2026-01-01' },
    });
    const second = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Smith Wedding', eventDate: '2027-01-01' },
    });

    assert.notEqual(
      first.data.data.event.driveFolderId,
      second.data.data.event.driveFolderId
    );
    assert.equal(fake.countEventFolders(), 2);
  });

  it('reuses the existing root folder across multiple events', async () => {
    const fake = useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'First Wedding', eventDate: '2026-01-01' },
    });
    await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Second Wedding', eventDate: '2026-02-02' },
    });

    assert.equal(fake.countRootFolders(), 1);
    assert.equal(fake.countEventFolders(), 2);
  });

  it('records a FAILED status and exposes a retry path when creation fails', async () => {
    const fake = new FakeDrive({
      failNext: {
        operation: 'create',
        error: Object.assign(new Error('quotaExceeded'), { code: 403 }),
      },
    });
    useFakeDrive(fake);

    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Failing Wedding', eventDate: '2026-12-12' },
    });

    // The event itself was still created.
    assert.equal(res.status, 201);
    assert.equal(res.data.data.event.driveFolderStatus, 'FAILED');
    assert.ok(res.data.data.event.driveFolderError);
    assert.match(res.data.data.driveMessage, /retried anytime/i);

    // The failure is persisted.
    const persisted = await Event.findById(res.data.data.event._id);
    assert.equal(persisted!.driveFolderStatus, 'FAILED');

    // Retrying succeeds and associates a folder.
    const retry = await call('POST', `/api/events/${res.data.data.event._id}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });

    assert.equal(retry.status, 200);
    assert.equal(retry.data.data.event.driveFolderStatus, 'CREATED');
    assert.ok(retry.data.data.event.driveFolderId, 'the retry must associate a folder id');
    assert.ok(retry.data.data.event.driveFolderWebViewLink);
    // The stale failure reason must be cleared once the folder exists.
    assert.equal(retry.data.data.event.driveFolderError, undefined);
    assert.equal(fake.countEventFolders(), 1);
  });

  it('increments the attempt counter on each retry', async () => {
    useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const created = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Attempt Counter Wedding', eventDate: '2026-12-12' },
    });

    await call('POST', `/api/events/${created.data.data.event._id}/drive-folder/retry`, {
      cookie: photographer.cookie,
    });

    const persisted = await Event.findById(created.data.data.event._id);
    assert.equal(persisted!.driveFolderAttempts, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. Expired access token / revoked refresh token
// ---------------------------------------------------------------------------
describe('Expired or revoked Google credentials', () => {
  it('flags the photographer as needing to reconnect when the grant is revoked', async () => {
    const fake = new FakeDrive();
    fake.failAllWith(invalidGrantError());
    useFakeDrive(fake);

    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Revoked Wedding', eventDate: '2026-12-12' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.data.event.driveFolderStatus, 'FAILED');

    const persistedPhotographer = await Photographer.findById(photographer.id);
    assert.equal(persistedPhotographer!.googleDrive.connected, false);
    assert.equal(persistedPhotographer!.googleDrive.reconnectRequired, true);
  });

  it('reports reconnectRequired through the status endpoint', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: false,
        reconnectRequired: true,
        googleEmail: 'photo@example.com',
        refreshTokenEncrypted: encrypt('refresh-token'),
      },
    });

    const res = await call('GET', '/api/integrations/google-drive/status', {
      cookie: photographer.cookie,
    });

    assert.equal(res.data.data.reconnectRequired, true);
    assert.equal(res.data.data.connected, false);
  });

  it('fails gracefully when the stored credential cannot be decrypted', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        // Not a valid ciphertext.
        refreshTokenEncrypted: 'not-valid-ciphertext',
        connectedAt: new Date(),
      },
    });

    // No fake installed -> the real factory is used, which fails to decrypt.
    setDriveClientFactory(null);

    // Exercise the real client factory directly.
    const persisted = await Photographer.findById(photographer.id);
    await assert.rejects(
      () => getDriveClientForPhotographer(persisted!),
      (err: any) => {
        assert.equal(err.code, 'DRIVE_RECONNECT_REQUIRED');
        assert.equal(err.status, 401);
        return true;
      }
    );

    const after = await Photographer.findById(photographer.id);
    assert.equal(after!.googleDrive.reconnectRequired, true);
    assert.equal(after!.googleDrive.connected, false);
  });
  it('disconnects and clears stored credentials', async () => {
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        googleEmail: 'photo@example.com',
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const res = await call('DELETE', '/api/integrations/google-drive/disconnect', {
      cookie: photographer.cookie,
    });

    assert.equal(res.status, 200);

    const persisted = await Photographer.findById(photographer.id);
    assert.equal(persisted!.googleDrive.connected, false);
    assert.equal(persisted!.googleDrive.refreshTokenEncrypted, undefined);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-photographer access denial
// ---------------------------------------------------------------------------
describe('Cross-photographer access denial', () => {
  it("denies reading another photographer's event Drive folder", async () => {
    useFakeDrive(new FakeDrive());
    const owner = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });
    const attacker = await createPhotographer();

    const created = await call('POST', '/api/events', {
      cookie: owner.cookie,
      body: { title: 'Private Wedding', eventDate: '2026-12-12' },
    });
    const eventId = created.data.data.event._id;

    const res = await call('GET', `/api/events/${eventId}/drive-folder`, {
      cookie: attacker.cookie,
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'EVENT_NOT_FOUND');
  });

  it("denies retrying folder creation for another photographer's event", async () => {
    useFakeDrive(new FakeDrive());
    const owner = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });
    const attacker = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('attacker-refresh-token'),
        connectedAt: new Date(),
      },
    });

    const created = await call('POST', '/api/events', {
      cookie: owner.cookie,
      body: { title: 'Private Wedding', eventDate: '2026-12-12' },
    });
    const eventId = created.data.data.event._id;

    const res = await call('POST', `/api/events/${eventId}/drive-folder/retry`, {
      cookie: attacker.cookie,
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'EVENT_NOT_FOUND');
  });

  it("denies reading another photographer's event details", async () => {
    useFakeDrive(new FakeDrive());
    const owner = await createPhotographer();
    const attacker = await createPhotographer();

    const created = await call('POST', '/api/events', {
      cookie: owner.cookie,
      body: { title: 'Private Wedding', eventDate: '2026-12-12' },
    });

    const res = await call('GET', `/api/events/${created.data.data.event._id}`, {
      cookie: attacker.cookie,
    });

    assert.equal(res.status, 404);
  });

  it('does not allow a client to inject a Drive folder id through event update', async () => {
    useFakeDrive(new FakeDrive());
    const photographer = await createPhotographer({
      googleDrive: {
        connected: true,
        refreshTokenEncrypted: encrypt('refresh-token'),
        connectedAt: new Date(),
      },
    });

    const created = await call('POST', '/api/events', {
      cookie: photographer.cookie,
      body: { title: 'Injection Test Wedding', eventDate: '2026-12-12' },
    });
    const eventId = created.data.data.event._id;

    const res = await call('PATCH', `/api/events/${eventId}`, {
      cookie: photographer.cookie,
      body: {
        title: 'Injection Test Wedding',
        driveFolderId: 'someone-elses-folder-id',
        driveFolderName: 'Hijacked',
        driveConnectionStatus: 'CONNECTED',
      },
    });

    assert.equal(res.status, 200);

    const persisted = await Event.findById(eventId);
    assert.notEqual(persisted!.driveFolderId, 'someone-elses-folder-id');
    assert.notEqual(persisted!.driveFolderName, 'Hijacked');
  });
});

// ---------------------------------------------------------------------------
// 8. Authentication boundaries
// ---------------------------------------------------------------------------
describe('Drive endpoint authentication', () => {
  it('rejects unauthenticated access to every Drive endpoint', async () => {
    const endpoints: Array<[string, string]> = [
      ['GET', '/api/integrations/google-drive/status'],
      ['GET', '/api/integrations/google-drive/connect'],
      ['DELETE', '/api/integrations/google-drive/disconnect'],
      ['POST', '/api/integrations/google-drive/verify'],
    ];

    for (const [method, url] of endpoints) {
      const res = await call(method, url);
      assert.equal(res.status, 401, `${method} ${url} should require authentication`);
    }
  });

  it('rejects a superadmin session from using photographer Drive endpoints', async () => {
    const { signSuperAdminSession } = await import('../utils/tokens.js');
    const bcrypt = await import('bcryptjs');

    const admin = await Photographer.create({
      name: 'Penta Prizm Admin',
      email: `admin_${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash('AdminPassword2026!', 10),
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      googleDrive: { connected: false },
    });

    const adminToken = signSuperAdminSession({
      id: admin._id.toString(),
      email: admin.email,
    });

    const res = await call('GET', '/api/integrations/google-drive/status', {
      cookie: `wedding_auth_token=${adminToken}`,
    });

    // Photographer and superadmin sessions use distinct token types, so a
    // superadmin session is rejected by the photographer surface entirely.
    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'INVALID_TOKEN');
  });

  it('blocks a suspended studio from connecting Google Drive', async () => {
    const photographer = await createPhotographer({ status: 'SUSPENDED' });

    const res = await call('GET', '/api/integrations/google-drive/connect', {
      cookie: photographer.cookie,
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'ACCOUNT_SUSPENDED');
  });
});
