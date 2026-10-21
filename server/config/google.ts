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

export function getOAuth2Client() {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google OAuth credentials are not configured in environment variables.');
  }

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];
