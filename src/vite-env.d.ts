/// <reference types="vite/client" />

/**
 * Typed access to the Vite environment.
 *
 * Only `VITE_`-prefixed variables are exposed to the browser bundle, and only
 * PUBLIC identifiers belong here. Server secrets (the Firebase service account
 * private key, the Google OAuth client secret, the token encryption key and
 * the OAuth state secret) must NEVER be added to this file — they are read
 * from `process.env` by the Express backend only.
 */
interface ImportMetaEnv {
  /** Base URL of the API. */
  readonly VITE_API_BASE_URL?: string;

  // -------------------------------------------------------------------------
  // Firebase Web App configuration (public identifiers)
  // -------------------------------------------------------------------------
  /**
   * Firebase Web API key. This is a PUBLIC identifier for Firebase Web Apps,
   * not a secret — Firebase explicitly documents it as safe to ship in
   * client-side code. Access is controlled by Firebase Security Rules and by
   * the OAuth consent screen, not by hiding this value.
   */
  readonly VITE_FIREBASE_API_KEY?: string;
  /** Firebase auth domain, e.g. `<project-id>.firebaseapp.com`. */
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  /** Firebase project id. */
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  /** Cloud Storage bucket for the project. */
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  /** Cloud Messaging sender id. */
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  /** Firebase Web App id. */
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
