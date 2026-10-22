import { google, drive_v3 } from 'googleapis';
import { IPhotographer, Photographer } from '../models/Photographer.js';
import { IEvent, Event } from '../models/Event.js';
import { getOAuth2Client, isGoogleDriveConfigured } from '../config/google.js';
import { decrypt, encrypt } from '../utils/encryption.js';

const APP_ROOT_FOLDER_NAME = 'Wedding AI Photo Finder';

export interface DriveFolderResult {
  folderId: string;
  folderName: string;
  webViewLink?: string;
}

/**
 * Instantiates an authenticated Google Drive API client for the given photographer.
 * Decrypts the securely stored refresh token and handles token refreshes.
 */
export async function getDriveClientForPhotographer(
  photographer: IPhotographer
): Promise<{ drive: drive_v3.Drive; oauth2Client: any }> {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive integration is not configured on this server.');
  }

  if (!photographer.googleDrive?.connected || !photographer.googleDrive?.refreshTokenEncrypted) {
    throw new Error('Google Drive is not connected to this photographer studio account.');
  }

  let plainRefreshToken: string;
  try {
    plainRefreshToken = decrypt(photographer.googleDrive.refreshTokenEncrypted);
  } catch (err: any) {
    console.error(`[Google Drive] Failed to decrypt refresh token for ${photographer.email}:`, err);
    photographer.googleDrive.reconnectRequired = true;
    photographer.googleDrive.connected = false;
    await photographer.save();
    throw new Error('Stored Google Drive credentials could not be decrypted. Please reconnect Google Drive.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: plainRefreshToken,
  });

  // Handle token rotation if Google issues a new refresh token
  oauth2Client.on('tokens', async (tokens: any) => {
    if (tokens.refresh_token) {
      try {
        const encrypted = encrypt(tokens.refresh_token);
        await Photographer.findByIdAndUpdate(photographer._id, {
          'googleDrive.refreshTokenEncrypted': encrypted,
          'googleDrive.reconnectRequired': false,
        });
      } catch (err) {
        console.error('[Google Drive] Failed to persist rotated refresh token:', err);
      }
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return { drive, oauth2Client };
}

/**
 * Idempotently retrieves or creates the dedicated parent folder "Wedding AI Photo Finder"
 * in the photographer's Google Drive.
 */
export async function getOrCreateAppRootFolder(
  drive: drive_v3.Drive,
  photographer: IPhotographer
): Promise<string> {
  // 1. Check if cached root folder exists and is valid
  if (photographer.googleDrive.rootFolderId) {
    try {
      const existing = await drive.files.get({
        fileId: photographer.googleDrive.rootFolderId,
        fields: 'id, name, trashed',
      });
      if (existing.data.id && !existing.data.trashed) {
        return existing.data.id;
      }
    } catch (err: any) {
      // If folder was deleted or not found, proceed to search or recreate
      console.warn(`[Google Drive] Cached root folder ${photographer.googleDrive.rootFolderId} not accessible. Searching...`);
    }
  }

  // 2. Search for existing un-trashed folder with matching name
  try {
    const listRes = await drive.files.list({
      q: `name = '${APP_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive',
      pageSize: 5,
    });

    if (listRes.data.files && listRes.data.files.length > 0) {
      const foundId = listRes.data.files[0].id!;
      photographer.googleDrive.rootFolderId = foundId;
      await photographer.save();
      return foundId;
    }
  } catch (err: any) {
    console.warn('[Google Drive] Root folder search error:', err.message);
  }

  // 3. Create dedicated parent folder
  const createRes = await drive.files.create({
    requestBody: {
      name: APP_ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Dedicated storage folder for Wedding AI Photo Finder wedding galleries',
    },
    fields: 'id, name, webViewLink',
  });

  const rootId = createRes.data.id!;
  photographer.googleDrive.rootFolderId = rootId;
  await photographer.save();

  return rootId;
}

/**
 * Idempotently creates a Google Drive folder for a wedding event.
 * If the folder already exists, it verifies and associates it without creating duplicates.
 */
export async function createEventFolderInDrive(
  photographer: IPhotographer,
  event: IEvent
): Promise<DriveFolderResult> {
  let drive: drive_v3.Drive;

  try {
    const client = await getDriveClientForPhotographer(photographer);
    drive = client.drive;
  } catch (err: any) {
    event.driveFolderStatus = 'FAILED';
    event.driveFolderError = err.message || 'Google Drive not connected';
    event.driveConnectionStatus = 'ERROR';
    await event.save();
    throw err;
  }

  // Idempotency check: If event already has a folder ID, check if it's alive in Drive
  if (event.driveFolderId) {
    try {
      const existing = await drive.files.get({
        fileId: event.driveFolderId,
        fields: 'id, name, webViewLink, trashed',
      });

      if (existing.data.id && !existing.data.trashed) {
        event.driveFolderStatus = 'CREATED';
        event.driveConnectionStatus = 'CONNECTED';
        event.driveFolderWebViewLink = existing.data.webViewLink || event.driveFolderWebViewLink;
        event.driveFolderError = undefined;
        await event.save();

        return {
          folderId: existing.data.id,
          folderName: existing.data.name || event.title,
          webViewLink: existing.data.webViewLink || undefined,
        };
      }
    } catch (checkErr: any) {
      console.warn(`[Google Drive] Existing folder check failed for event ${event._id}:`, checkErr.message);
    }
  }

  try {
    event.driveFolderStatus = 'PENDING';
    await event.save();

    // Ensure parent "Wedding AI Photo Finder" folder exists
    const rootFolderId = await getOrCreateAppRootFolder(drive, photographer);

    // Sanitize folder name
    const folderName = event.title.trim().replace(/[/\\?%*:|"<>]/g, '-');

    // Check if folder with same title already exists under the parent root folder to avoid duplicates on retry
    const existingSearch = await drive.files.list({
      q: `'${rootFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive',
      pageSize: 1,
    });

    let folderId: string;
    let webViewLink: string | undefined;

    if (existingSearch.data.files && existingSearch.data.files.length > 0) {
      // Reuse existing folder
      folderId = existingSearch.data.files[0].id!;
      webViewLink = existingSearch.data.files[0].webViewLink || undefined;
      console.log(`[Google Drive] Associated existing event folder ${folderId} for event "${event.title}"`);
    } else {
      // Create new folder inside the parent root folder
      const createRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
          description: `Wedding photo gallery for ${event.title}`,
        },
        fields: 'id, name, webViewLink',
      });

      folderId = createRes.data.id!;
      webViewLink = createRes.data.webViewLink || undefined;
      console.log(`[Google Drive] Created new event folder ${folderId} for event "${event.title}"`);
    }

    // Persist folder information to Event document
    event.driveFolderId = folderId;
    event.driveFolderName = folderName;
    event.driveFolderWebViewLink = webViewLink;
    event.driveFolderStatus = 'CREATED';
    event.driveFolderError = undefined;
    event.driveConnectionStatus = 'CONNECTED';
    await event.save();

    return {
      folderId,
      folderName,
      webViewLink,
    };
  } catch (error: any) {
    console.error(`[Google Drive] Folder creation failed for event ${event._id}:`, error);

    // If token invalid / revoked, flag reconnect
    if (error?.message?.includes('invalid_grant') || error?.code === 401) {
      photographer.googleDrive.reconnectRequired = true;
      photographer.googleDrive.connected = false;
      await photographer.save();
    }

    event.driveFolderStatus = 'FAILED';
    event.driveFolderError = error.message || 'Failed to create Google Drive folder';
    event.driveConnectionStatus = 'ERROR';
    await event.save();

    throw new Error(`Google Drive folder creation failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Revokes Google OAuth token and clears credentials from photographer record.
 */
export async function revokeDriveAccess(photographer: IPhotographer): Promise<void> {
  if (photographer.googleDrive?.refreshTokenEncrypted) {
    try {
      const plainToken = decrypt(photographer.googleDrive.refreshTokenEncrypted);
      const oauth2Client = getOAuth2Client();
      await oauth2Client.revokeToken(plainToken);
    } catch (err: any) {
      console.warn('[Google Drive] Token revocation warning (token may already be expired/revoked):', err.message);
    }
  }

  photographer.googleDrive = {
    connected: false,
    googleEmail: undefined,
    refreshTokenEncrypted: undefined,
    connectedAt: undefined,
    rootFolderId: undefined,
    reconnectRequired: false,
  };

  await photographer.save();
}
