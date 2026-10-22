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

export function getOAuth2Client(overrideRedirectUri?: string) {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google OAuth credentials are not configured in environment variables.');
  }

  const redirectUri = overrideRedirectUri || env.GOOGLE_REDIRECT_URI;

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// Minimum suitable Drive permission: drive.file (per-file/folder access for items created by this app)
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
];
