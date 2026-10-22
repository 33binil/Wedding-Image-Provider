/**
 * Shared test harness.
 *
 * These are AUTOMATED tests. They run against a real MongoDB instance
 * (embedded mongod) and exercise the application's own logic. The Google Drive
 * API surface is replaced by an in-process fake Drive client — see
 * `fakeDrive.ts` — which means these tests verify OUR integration logic
 * (idempotency, ownership, retry, persistence) and NOT Google's servers.
 *
 * A real end-to-end Google OAuth + Drive API verification is performed
 * separately by `server/scripts/verifyGoogleDriveLive.ts`, which requires
 * real GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and a human completing the
 * Google consent screen.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Photographer } from '../models/Photographer.js';
import { Event } from '../models/Event.js';

let mongod: MongoMemoryServer | null = null;

export async function startTestDatabase(): Promise<string> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'wedding_ai_photo_finder_test' });

  return uri;
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearCollections(): Promise<void> {
  await Promise.all([
    Photographer.deleteMany({}),
    Event.deleteMany({}),
  ]);
}

export interface TestPhotographer {
  id: string;
  email: string;
  sessionToken: string;
  cookie: string;
}

/**
 * Creates an ACTIVE photographer with a valid photographer session token.
 *
 * Photographers authenticate with Firebase Google Sign-In in production, so
 * no password hash is stored. `firebaseUid` links the record to a Firebase
 * identity; leave it undefined to simulate a legacy account that has not
 * signed in with Google yet.
 */
export async function createPhotographer(
  overrides: Partial<{
    email: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
    firebaseUid?: string;
    googleDrive: {
      connected: boolean;
      googleEmail?: string;
      refreshTokenEncrypted?: string;
      connectedAt?: Date;
      rootFolderId?: string;
      reconnectRequired?: boolean;
    };
  }> = {}
): Promise<TestPhotographer> {
  const { signPhotographerSession } = await import('../utils/tokens.js');

  const email = overrides.email || `studio_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

  const photographer = await Photographer.create({
    name: overrides.name || 'Test Studio',
    email,
    ...(overrides.firebaseUid ? { firebaseUid: overrides.firebaseUid } : {}),
    role: 'PHOTOGRAPHER',
    status: overrides.status || 'ACTIVE',
    trialStartAt: new Date(),
    trialExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    googleDrive: {
      connected: false,
      reconnectRequired: false,
      ...(overrides.googleDrive || {}),
    },
  });

  const token = signPhotographerSession({
    id: photographer._id.toString(),
    email: photographer.email,
  });

  return {
    id: photographer._id.toString(),
    email,
    sessionToken: token,
    cookie: `wedding_auth_token=${token}`,
  };
}
