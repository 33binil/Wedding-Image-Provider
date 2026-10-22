import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { env } from './env.js';

export interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;
let initError: string | null = null;

/**
 * Parses the service account from the environment.
 *
 * Two supported shapes:
 *  1. FIREBASE_SERVICE_ACCOUNT — the complete JSON blob (recommended on Vercel,
 *     where there is no filesystem to read a key file from).
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY —
 *     the same values split into individual variables.
 */
export function getServiceAccount(): FirebaseServiceAccount | null {
  const rawJson = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          // Secret managers frequently store the key with escaped newlines.
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    } catch {
      initError = 'FIREBASE_SERVICE_ACCOUNT is not valid JSON.';
    }
    return null;
  }

  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY?.trim();

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

/**
 * True when the server has enough configuration to verify Firebase ID tokens.
 */
export function isFirebaseConfigured(): boolean {
  return getServiceAccount() !== null;
}

/**
 * The Firebase project the backend verifies tokens against. This is a public
 * identifier and is exposed so the frontend can detect a frontend/backend
 * project mismatch.
 */
export function getFirebaseProjectId(): string | null {
  return getServiceAccount()?.project_id ?? null;
}

/**
 * Lazily initialises the Firebase Admin app and returns the Auth instance.
 * Returns null when the server is not configured for Firebase.
 */
export function getFirebaseAuth(): Auth | null {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    return null;
  }

  try {
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      });
    } else {
      firebaseApp = getApps()[0];
    }

    firebaseAuth = getAuth(firebaseApp);
    return firebaseAuth;
  } catch (err: any) {
    initError = err?.message || 'Failed to initialise the Firebase Admin SDK.';
    console.error('[Firebase] Admin SDK initialisation failed:', initError);
    return null;
  }
}

/**
 * True when the server HAS service-account configuration but the Admin SDK
 * failed to initialise (e.g. a malformed private key). This is a deployment
 * error rather than a "feature not enabled" situation.
 */
export function isFirebaseMisconfigured(): boolean {
  return Boolean(initError);
}

export function getFirebaseInitError(): string | null {
  return initError;
}

/**
 * Test seam: allows injecting a pre-built Auth instance.
 */
export function setFirebaseAuthForTesting(auth: Auth | null): void {
  firebaseAuth = auth;
  firebaseApp = null;
}
