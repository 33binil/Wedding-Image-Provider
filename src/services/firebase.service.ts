import {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type UserCredential,
} from '@firebase/auth';
import { api } from './api.js';
import {
  getFirebaseAuth,
  getFirebaseProjectId,
  getMissingFirebaseConfigKeys,
  isFirebaseClientConfigured,
} from '../config/firebase.js';

/**
 * A human-readable explanation of why Google Sign-In is unavailable, listing
 * the exact environment variables that still need to be set.
 */
export function getFirebaseConfigurationMessage(): string | null {
  if (isFirebaseClientConfigured()) {
    return null;
  }

  const missing = getMissingFirebaseConfigKeys();
  return (
    `Google Sign-In is not configured yet. Missing environment variable(s): ${missing.join(', ')}. ` +
    'Add them to your .env file (see .env.example) and restart the development server.'
  );
}

/**
 * Signs the user in with Google through Firebase Authentication and returns
 * the Firebase ID token for the backend to verify.
 */
export async function signInWithGoogle(): Promise<{ idToken: string }> {
  const configurationMessage = getFirebaseConfigurationMessage();
  if (configurationMessage) {
    throw new Error(configurationMessage);
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Authentication could not be initialised.');
  }

  // Check the backend can actually verify the tokens this client produces.
  // This turns two common misconfigurations into an actionable message
  // instead of an opaque "invalid ID token" from the server.
  const backendStatus = await getBackendFirebaseStatus();
  if (!backendStatus.configured) {
    throw new Error(
      'The server is not able to verify Firebase sign-in yet. Please contact Penta Prizm support.'
    );
  }
  if (backendStatus.projectMismatch) {
    throw new Error(
      `Firebase project mismatch: the browser is configured for "${getFirebaseProjectId()}" ` +
        `but the server verifies tokens for "${backendStatus.projectId}".`
    );
  }

  // Persist the session so a returning user stays signed in.
  await setPersistence(auth, browserLocalPersistence);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let credential: UserCredential;
  try {
    credential = await signInWithPopup(auth, provider);
  } catch (popupError: any) {
    // Popups are frequently blocked. Fall back to a full-page redirect.
    if (
      popupError?.code === 'auth/popup-blocked' ||
      popupError?.code === 'auth/popup-closed-by-user' ||
      popupError?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      // The redirect navigates away, so execution stops here.
      return new Promise(() => undefined);
    }
    throw popupError;
  }

  const idToken = await credential.user.getIdToken(true);
  return { idToken };
}

/**
 * Signs the user out of Firebase and clears the local session.
 */
export async function signOutOfFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }
  try {
    await auth.signOut();
  } catch {
    // Ignore — the backend session is cleared regardless.
  }
}

/**
 * Returns the current Firebase user's ID token, if one is available.
 */
export async function getCurrentIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    return null;
  }
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Whether the BACKEND is able to verify Firebase ID tokens. The frontend
 * configuration can be present while the server-side service account is
 * missing, which produces a confusing error without this check.
 */
export async function isBackendFirebaseConfigured(): Promise<boolean> {
  const status = await getBackendFirebaseStatus();
  return status.configured;
}

/**
 * Describes the backend's Firebase readiness, including a frontend/backend
 * project mismatch (a very common cause of "invalid ID token" errors).
 */
export async function getBackendFirebaseStatus(): Promise<{
  configured: boolean;
  projectId?: string;
  projectMismatch: boolean;
}> {
  const frontendProjectId = getFirebaseProjectId();

  try {
    const res = await api.get('/auth/firebase-config');
    const data = res.data?.data || {};
    const backendProjectId: string | undefined = data.projectId || undefined;

    return {
      configured: Boolean(data.configured),
      projectId: backendProjectId,
      projectMismatch: Boolean(
        backendProjectId &&
          frontendProjectId &&
          backendProjectId !== frontendProjectId
      ),
    };
  } catch {
    return { configured: false, projectMismatch: false };
  }
}
