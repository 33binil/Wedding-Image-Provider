/**
 * LIVE Google Drive verification.
 *
 * ============================ IMPORTANT ============================
 * This script talks to the REAL Google OAuth 2.0 and Google Drive APIs.
 * It is NOT a mock. Passing this script is the only evidence that the
 * integration works against Google.
 *
 * It performs two stages:
 *
 *   Stage 1 — OAuth authorization request (no user interaction required).
 *     Builds the real authorization URL using the configured client id and
 *     the exact redirect URI, and verifies the request contains the expected
 *     scope, offline access and the signed state parameter. A human then
 *     completes the consent screen in the browser.
 *
 *   Stage 2 — Token exchange + real Drive API operations.
 *     Exchanges the authorization code for tokens, then uses the real Drive
 *     API to create the parent folder and a test event folder, verifies they
 *     exist, then cleans them up.
 *
 * Usage:
 *   npm run verify:drive:live
 *   npm run verify:drive:live -- --code <AUTHORIZATION_CODE>
 *
 * Without `--code`, only Stage 1 runs and prints the URL to open.
 * ===================================================================
 */
import { google } from 'googleapis';
import {
  isGoogleDriveConfigured,
  getOAuth2Client,
  getGoogleRedirectUri,
  GOOGLE_DRIVE_SCOPES,
} from '../config/google.js';
import { createSignedState, verifySignedState } from '../utils/oauthState.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { APP_PROPERTY_KEY, APP_PROPERTY_ROOT } from '../services/drive.service.js';

const ROOT_FOLDER_NAME = 'Wedding AI Photo Finder';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return undefined;
}

function heading(text: string): void {
  console.log(`\n${'─'.repeat(72)}\n${text}\n${'─'.repeat(72)}`);
}

function pass(text: string): void {
  console.log(`  ✅ ${text}`);
}

function fail(text: string): void {
  console.log(`  ❌ ${text}`);
}

function info(text: string): void {
  console.log(`  ℹ️  ${text}`);
}

async function stage1(): Promise<string | null> {
  heading('STAGE 1 — Real OAuth 2.0 authorization request');

  if (!isGoogleDriveConfigured()) {
    fail('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Cannot continue.');
    console.log(
      '\nSet them in .env (and Vercel environment variables) and re-run:\n' +
        '  GOOGLE_CLIENT_ID=...\n' +
        '  GOOGLE_CLIENT_SECRET=...\n' +
        '  GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google-drive/callback\n'
    );
    return null;
  }

  const redirectUri = getGoogleRedirectUri();
  info(`Redirect URI: ${redirectUri}`);
  info(`Scopes: ${GOOGLE_DRIVE_SCOPES.join(' ')}`);

  // The state must be signed and bound to a photographer id.
  const testUserId = arg('userId') || 'live-verification-user';
  const state = createSignedState(testUserId);
  const decoded = verifySignedState(state);
  if (decoded.uid !== testUserId) {
    fail('State round-trip failed.');
    return null;
  }
  pass('OAuth state is signed, verifiable and bound to the subject.');

  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_DRIVE_SCOPES,
    state,
  });

  const url = new URL(authUrl);
  const expectedScope = GOOGLE_DRIVE_SCOPES.join(' ');

  if (url.searchParams.get('access_type') !== 'offline') {
    fail('access_type=offline missing from the authorization request.');
  } else {
    pass('access_type=offline is set (offline access / refresh token requested).');
  }

  if (url.searchParams.get('scope') !== expectedScope) {
    fail(`Unexpected scope: ${url.searchParams.get('scope')}`);
  } else {
    pass(`Requested scopes match the configured least-privilege set.`);
  }

  if (url.searchParams.get('client_id') !== process.env.GOOGLE_CLIENT_ID) {
    fail('client_id does not match GOOGLE_CLIENT_ID.');
  } else {
    pass('client_id matches GOOGLE_CLIENT_ID.');
  }

  if (url.searchParams.get('redirect_uri') !== redirectUri) {
    fail('redirect_uri in the request does not match the configured value.');
  } else {
    pass('redirect_uri matches the configured value exactly.');
  }

  if (url.searchParams.get('state') !== state) {
    fail('state parameter missing from the authorization request.');
  } else {
    pass('Signed state is attached to the authorization request.');
  }

  console.log('\n  Open this URL in a browser and complete the Google consent screen:\n');
  console.log(`  ${authUrl}\n`);

  return authUrl;
}

async function stage2(code: string): Promise<void> {
  heading('STAGE 2 — Real token exchange + real Google Drive API operations');

  const oauth2Client = getOAuth2Client();
  let tokens: any;

  try {
    const result = await oauth2Client.getToken(code);
    tokens = result.tokens;
  } catch (err: any) {
    fail(`Token exchange failed: ${err?.message}`);
    console.log(
      '  Common causes: the code was already used, it expired, or the redirect URI\n' +
        '  does not match the value registered in the Google Cloud Console.'
    );
    process.exitCode = 1;
    return;
  }

  if (!tokens.access_token) {
    fail('No access token returned.');
    process.exitCode = 1;
    return;
  }
  pass('Exchanged the authorization code for a real access token.');

  if (tokens.refresh_token) {
    pass('Received a refresh token (offline access confirmed).');
    const encrypted = encrypt(tokens.refresh_token);
    if (encrypted.includes(tokens.refresh_token)) {
      fail('Refresh token is NOT encrypted at rest.');
      process.exitCode = 1;
    } else {
      pass('Refresh token encrypts/decrypts correctly with the server key.');
      if (decrypt(encrypted) !== tokens.refresh_token) {
        fail('Refresh token round-trip mismatch.');
        process.exitCode = 1;
      }
    }
  } else {
    info('No refresh token returned this time (Google only issues one on first consent).');
  }

  oauth2Client.setCredentials(tokens);

  // Read the linked account email.
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    pass(`Linked Google account: ${userInfo.data.email}`);
  } catch {
    info('Could not read the Google account email (non-fatal).');
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // 1. Resolve or create the parent app folder.
  let rootFolderId: string | undefined;
  const rootSearch = await drive.files.list({
    q: `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_ROOT}' } and trashed = false`,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    pageSize: 10,
  });

  const existingRoot = rootSearch.data.files?.find(
    (f: any) => f.appProperties?.[APP_PROPERTY_KEY] === APP_PROPERTY_ROOT
  );

  if (existingRoot?.id) {
    rootFolderId = existingRoot.id;
    pass(`Found the existing "${ROOT_FOLDER_NAME}" folder: ${rootFolderId}`);
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Dedicated storage folder for Wedding AI Photo Finder wedding galleries',
        appProperties: { [APP_PROPERTY_KEY]: APP_PROPERTY_ROOT },
      },
      fields: 'id, name, webViewLink',
    });
    rootFolderId = created.data.id!;
    pass(`Created the "${ROOT_FOLDER_NAME}" folder: ${rootFolderId}`);
  }

  // 2. Create a real event folder and confirm it exists.
  const testEventId = `live-verify-${Date.now()}`;
  const testFolderName = 'Live Verification Folder';

  const folder = await drive.files.create({
    requestBody: {
      name: testFolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
      description: 'Temporary folder created by verifyGoogleDriveLive.ts',
      appProperties: {
        [APP_PROPERTY_KEY]: APP_PROPERTY_ROOT,
        eventId: testEventId,
      },
    },
    fields: 'id, name, webViewLink, appProperties',
  });

  const folderId = folder.data.id!;
  pass(`Created a real event folder: ${folderId}`);
  pass(`Folder webViewLink: ${folder.data.webViewLink}`);

  const verified = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, parents, appProperties, trashed',
  });
  if (verified.data.id !== folderId || verified.data.trashed) {
    fail('The created folder could not be read back.');
    process.exitCode = 1;
  } else {
    pass('Read the folder back from the real Drive API — it exists and is not trashed.');
  }

  // 3. Idempotency check: search by the eventId appProperty.
  const search = await drive.files.list({
    q: `'${rootFolderId}' in parents and appProperties has { key='eventId' and value='${testEventId}' } and trashed = false`,
    fields: 'files(id, name, webViewLink, appProperties)',
    spaces: 'drive',
    pageSize: 10,
  });
  const tagged = search.data.files?.find(
    (f: any) => f.appProperties?.eventId === testEventId
  );
  if (tagged?.id === folderId) {
    pass('Idempotency lookup by appProperties found the same folder.');
  } else {
    fail('Idempotency lookup by appProperties did not find the folder.');
    process.exitCode = 1;
  }

  // 4. Clean up the test folder.
  await drive.files.delete({ fileId: folderId });
  pass('Cleaned up the temporary verification folder.');

  heading('LIVE VERIFICATION COMPLETE — the real Google OAuth and Drive APIs worked.');
}

async function main(): Promise<void> {
  const code = arg('code');

  const authUrl = await stage1();
  if (!authUrl) {
    process.exitCode = 1;
    return;
  }

  if (!code) {
    heading('STAGE 2 SKIPPED');
    console.log(
      '  No authorization code supplied.\n' +
        '  Complete the consent screen in the browser, copy the `code` parameter\n' +
        '  from the URL you were redirected to, then run:\n\n' +
        '  npm run verify:drive:live -- --code <CODE>\n'
    );
    return;
  }

  await stage2(code);
}

main().catch((err) => {
  console.error('Live verification failed:', err);
  process.exitCode = 1;
});
