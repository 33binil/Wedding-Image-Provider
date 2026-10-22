import { google } from 'googleapis';
import { env } from './env.js';

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_CLIENT_ID.trim().length > 0 &&
    env.GOOGLE_CLIENT_SECRET.trim().length > 0
  );
}

/**
 * Detects whether the server is running in a production-like environment
 * (Vercel serverless, or an explicit NODE_ENV=production deployment).
 */
export function isProductionEnvironment(): boolean {
  return env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

/**
 * Resolves the exact OAuth callback URI for the current environment.
 *
 * Google matches redirect URIs byte-for-byte, so local development and
 * production MUST use different values and each must be registered verbatim
 * in the Google Cloud Console under "Authorized redirect URIs".
 */
export function getGoogleRedirectUri(): string {
  if (isProductionEnvironment() && env.GOOGLE_REDIRECT_URI_PRODUCTION.trim().length > 0) {
    return env.GOOGLE_REDIRECT_URI_PRODUCTION.trim();
  }
  return env.GOOGLE_REDIRECT_URI.trim();
}

/**
 * The redirect URI that is actually registered with Google for the running
 * environment. Exposed to the frontend so the setup guide can instruct
 * administrators to register the exact same string.
 */
export function getRegisteredRedirectUriHint(): string {
  return getGoogleRedirectUri();
}

export function getOAuth2Client(overrideRedirectUri?: string) {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google OAuth credentials are not configured in environment variables.');
  }

  const redirectUri = (overrideRedirectUri || getGoogleRedirectUri()).trim();

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/**
 * Minimum suitable Drive permission set.
 *
 * - drive.file        : per-file access to files/folders this app creates.
 *                       Sufficient for creating the app parent folder and one
 *                       folder per wedding event, without granting read access
 *                       to the photographer's entire Drive.
 * - userinfo.email    : read-only email so the studio dashboard can display
 *                       which Google account is linked. No profile data is stored.
 */
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];
