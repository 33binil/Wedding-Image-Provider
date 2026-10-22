import { initializeApp, getApp, getApps, type FirebaseApp } from '@firebase/app';
import { getAuth, type Auth } from '@firebase/auth';

/**
 * Reusable Firebase client module.
 *
 * Responsibilities:
 *   - Read the Firebase Web App configuration from the VITE_ environment
 *     variables.
 *   - Validate the configuration lazily, so the application can still boot and
 *     show an actionable message instead of crashing when Firebase has not
 *     been set up yet.
 *   - Initialise the Firebase app and Auth instance exactly once.
 *
 * Only PUBLIC identifiers are read here. Firebase Analytics is intentionally
 * NOT initialised — it is not needed for authentication and it would add a
 * third-party script to the page.
 *
 * The backend keeps its own copy of the configuration (the service account) so
 * it can verify the ID tokens the browser sends. That private key is never
 * imported into frontend code.
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/**
 * The configuration keys Firebase Authentication genuinely requires.
 *
 * `storageBucket` and `messagingSenderId` are part of the standard Firebase
 * Web App configuration but are only needed for Storage and Cloud Messaging —
 * they are therefore optional for sign-in.
 */
export const REQUIRED_FIREBASE_CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export const OPTIONAL_FIREBASE_CONFIG_KEYS = [
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
] as const;

/**
 * The raw environment values.
 *
 * These are read with STATIC `import.meta.env.VITE_*` accesses so that Vite
 * can inline them at build time (a dynamic property lookup would still work,
 * but static access is explicit, type-safe and guaranteed to be replaced).
 */
const ENV_VALUES: Record<string, string> = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  VITE_FIREBASE_MESSAGING_SENDER_ID:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

function readEnv(key: string): string {
  const value = ENV_VALUES[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The Firebase project this browser client is configured for.
 */
export function getFirebaseProjectId(): string {
  return readEnv('VITE_FIREBASE_PROJECT_ID');
}

/**
 * Returns the configuration keys that are required for sign-in but have not
 * been provided. An empty array means the client is ready.
 */
export function getMissingFirebaseConfigKeys(): string[] {
  return REQUIRED_FIREBASE_CONFIG_KEYS.filter((key) => !readEnv(key));
}

/**
 * True when the Firebase client has everything it needs for Google Sign-In.
 */
export function isFirebaseClientConfigured(): boolean {
  return getMissingFirebaseConfigKeys().length === 0;
}

/**
 * Builds the Firebase configuration from the environment.
 * Returns null when a required value is missing.
 */
export function getFirebaseClientConfig(): FirebaseClientConfig | null {
  if (!isFirebaseClientConfigured()) {
    return null;
  }

  const storageBucket = readEnv('VITE_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID');

  return {
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

/**
 * Returns the initialised Firebase app, or null when the configuration is
 * incomplete. Never throws, so the caller can render a helpful message.
 */
export function getFirebaseApp(): FirebaseApp | null {
  const config = getFirebaseClientConfig();
  if (!config) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
  }

  return firebaseApp;
}

/**
 * Returns the Firebase Auth instance, or null when the configuration is
 * incomplete.
 */
export function getFirebaseAuth(): Auth | null {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

/**
 * Test seam: clears the cached app/auth instances.
 */
export function resetFirebaseClient(): void {
  firebaseApp = null;
  firebaseAuth = null;
}
