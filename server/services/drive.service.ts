import { google, drive_v3 } from 'googleapis';
import { IPhotographer, Photographer } from '../models/Photographer.js';
import { IEvent, Event } from '../models/Event.js';
import { getOAuth2Client, isGoogleDriveConfigured } from '../config/google.js';
import { decrypt, encrypt } from '../utils/encryption.js';

const APP_ROOT_FOLDER_NAME = 'Wedding AI Photo Finder';

/** appProperties keys used to make Drive operations idempotent. */
export const APP_PROPERTY_KEY = 'weddingAiPhotoFinder';
export const APP_PROPERTY_EVENT_ID = 'eventId';
export const APP_PROPERTY_ROLE = 'role';
export const APP_PROPERTY_ROOT = 'root';

export type DriveErrorCode =
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_RECONNECT_REQUIRED'
  | 'DRIVE_INSUFFICIENT_SCOPE'
  | 'DRIVE_API_ERROR';

export class DriveError extends Error {
  public readonly code: DriveErrorCode;
  public readonly status: number;
  public readonly cause?: unknown;

  constructor(code: DriveErrorCode, message: string, status = 400, cause?: unknown) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

export interface DriveFolderResult {
  folderId: string;
  folderName: string;
  webViewLink?: string;
}

export interface DriveClient {
  drive: drive_v3.Drive;
  oauth2Client: any;
}

/**
 * Factory used to build an authenticated Drive client for a photographer.
 * Overridable so the logic can be exercised in tests without network access.
 */
export type DriveClientFactory = (
  photographer: IPhotographer
) => Promise<DriveClient>;

const defaultDriveClientFactory: DriveClientFactory = async (photographer) => {
  if (!isGoogleDriveConfigured()) {
    throw new DriveError(
      'DRIVE_NOT_CONFIGURED',
      'Google Drive integration is not configured on this server.',
      503
    );
  }

  if (!photographer.googleDrive?.connected || !photographer.googleDrive?.refreshTokenEncrypted) {
    throw new DriveError(
      'DRIVE_NOT_CONNECTED',
      'Google Drive is not connected to this photographer studio account.',
      400
    );
  }

  let plainRefreshToken: string;
  try {
    plainRefreshToken = decrypt(photographer.googleDrive.refreshTokenEncrypted);
  } catch (err) {
    // The stored credential cannot be read (e.g. encryption key rotated).
    await Photographer.updateOne(
      { _id: photographer._id },
      { $set: { 'googleDrive.reconnectRequired': true, 'googleDrive.connected': false } }
    );
    throw new DriveError(
      'DRIVE_RECONNECT_REQUIRED',
      'Stored Google Drive credentials could not be decrypted. Please reconnect Google Drive.',
      401,
      err
    );
  }

  const oauth2Client = getOAuth2Client();

  oauth2Client.setCredentials({
    refresh_token: plainRefreshToken,
  });

  // Google may rotate the refresh token. Persist the new one atomically so a
  // later full-document save() cannot overwrite it with the stale value.
  oauth2Client.on('tokens', async (tokens: any) => {
    if (tokens?.refresh_token) {
      try {
        await persistRotatedRefreshToken(photographer._id, tokens.refresh_token);
      } catch (err) {
        console.error('[Google Drive] Failed to persist rotated refresh token:', err);
      }
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return { drive, oauth2Client };
};

/**
 * Persists a rotated Google refresh token.
 *
 * The write is atomic ($set on the sub-document path only) AND the in-memory
 * document is updated, so neither a concurrent update nor a later
 * `document.save()` can revert the connection to a stale token.
 */
export async function persistRotatedRefreshToken(
  photographerId: any,
  plainRefreshToken: string
): Promise<string> {
  const encrypted = encrypt(plainRefreshToken);

  await Photographer.updateOne(
    { _id: photographerId },
    {
      $set: {
        'googleDrive.refreshTokenEncrypted': encrypted,
        'googleDrive.reconnectRequired': false,
      },
    }
  );

  return encrypted;
}

let driveClientFactory: DriveClientFactory = defaultDriveClientFactory;

/**
 * Test seam: allows injecting a Drive client factory. Production code paths
 * always use the real Google API client.
 */
export function setDriveClientFactory(factory: DriveClientFactory | null): void {
  driveClientFactory = factory || defaultDriveClientFactory;
}

/**
 * Instantiates an authenticated Google Drive API client for the given photographer.
 * Decrypts the securely stored refresh token and handles token refreshes.
 */
export async function getDriveClientForPhotographer(
  photographer: IPhotographer
): Promise<DriveClient> {
  return driveClientFactory(photographer);
}

/**
 * Maps a Google API/Drive error onto a stable, user-facing error code.
 */
export function classifyDriveError(error: any): DriveError {
  if (error instanceof DriveError) {
    return error;
  }

  const status: number = error?.code || error?.response?.status || 0;
  const reason: string = error?.response?.data?.error || error?.reason || '';
  const message: string = error?.message || 'Unknown Google Drive error';

  if (reason === 'invalid_grant' || reason === 'unauthorized_client' || /invalid_grant/i.test(message)) {
    return new DriveError(
      'DRIVE_RECONNECT_REQUIRED',
      'Your Google Drive authorization is no longer valid. Please reconnect Google Drive.',
      401,
      error
    );
  }

  if (status === 401) {
    return new DriveError(
      'DRIVE_RECONNECT_REQUIRED',
      'Google Drive rejected the stored credentials. Please reconnect Google Drive.',
      401,
      error
    );
  }

  if (status === 403) {
    // A 403 is only a scope problem when Google says so. Other 403s
    // (storage quota, rate limiting, per-file permission) are transient or
    // account-specific and must NOT force the photographer to reconnect.
    const scopeReasons = [
      'insufficientPermissions',
      'insufficientScope',
      'ACCESS_SCOPE_INSUFFICIENT',
      'appNotAuthorizedToFile',
      'insufficientFilePermissions',
    ];
    if (scopeReasons.includes(reason) || /insufficient/i.test(message)) {
      return new DriveError(
        'DRIVE_INSUFFICIENT_SCOPE',
        'Google Drive denied access. The stored authorization is missing the required Drive permissions. Please reconnect Google Drive.',
        403,
        error
      );
    }

    return new DriveError('DRIVE_API_ERROR', message || 'Google Drive request failed', 502, error);
  }

  return new DriveError('DRIVE_API_ERROR', message || 'Google Drive request failed', 502, error);
}

/**
 * Marks the photographer as needing to reconnect their Google Drive.
 * Uses an atomic $set so it never clobbers unrelated fields.
 */
export async function flagReconnectRequired(photographerId: any): Promise<void> {
  await Photographer.updateOne(
    { _id: photographerId },
    { $set: { 'googleDrive.reconnectRequired': true, 'googleDrive.connected': false } }
  );
}

/**
 * Idempotently retrieves or creates the dedicated parent folder
 * "Wedding AI Photo Finder" in the photographer's Google Drive.
 *
 * Identification is done through Drive `appProperties` rather than the folder
 * name, so the lookup is unambiguous even if the photographer renames or
 * manually creates a folder with the same title.
 */
export async function getOrCreateAppRootFolder(
  drive: drive_v3.Drive,
  photographer: IPhotographer
): Promise<string> {
  // 1. Cached root folder id, if it still exists and is not trashed.
  const cachedRootId = photographer.googleDrive?.rootFolderId;
  if (cachedRootId) {
    try {
      const existing = await drive.files.get({
        fileId: cachedRootId,
        fields: 'id, name, trashed, appProperties',
      });
      if (existing.data.id && !existing.data.trashed) {
        return existing.data.id;
      }
    } catch (err: any) {
      console.warn(
        `[Google Drive] Cached root folder ${cachedRootId} is no longer accessible; re-resolving.`
      );
    }
  }

  // 2. Resolve an existing app-owned root folder via appProperties.
  try {
    const listRes = await drive.files.list({
      q: `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_ROOT}' } and trashed = false`,
      fields: 'files(id, name, webViewLink, appProperties)',
      spaces: 'drive',
      pageSize: 10,
    });

    const match = listRes.data.files?.find(
      (file: any) => file.appProperties?.[APP_PROPERTY_KEY] === APP_PROPERTY_ROOT
    );

    if (match?.id) {
      await Photographer.updateOne(
        { _id: photographer._id },
        { $set: { 'googleDrive.rootFolderId': match.id } }
      );
      return match.id;
    }
  } catch (err: any) {
    // Authentication failures must propagate: continuing would attempt to
    // create a folder with a revoked grant.
    const classified = classifyDriveError(err);
    if (
      classified.code === 'DRIVE_RECONNECT_REQUIRED' ||
      classified.code === 'DRIVE_INSUFFICIENT_SCOPE'
    ) {
      throw classified;
    }
    console.warn(`[Google Drive] Root folder lookup failed: ${err?.message}`);
  }

  // 3. Create the dedicated parent folder.
  const createRes = await drive.files.create({
    requestBody: {
      name: APP_ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description:
        'Dedicated storage folder for Wedding AI Photo Finder wedding galleries',
      appProperties: {
        [APP_PROPERTY_KEY]: APP_PROPERTY_ROOT,
      },
    },
    fields: 'id, name, webViewLink, appProperties',
  });

  const rootId = createRes.data.id!;
  await Photographer.updateOne(
    { _id: photographer._id },
    { $set: { 'googleDrive.rootFolderId': rootId } }
  );

  return rootId;
}

/**
 * Builds a Drive-safe folder name from the event title.
 */
export function buildEventFolderName(title: string): string {
  const sanitized = (title || '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 200)
    .trim();

  return sanitized || 'Wedding Event';
}

/**
 * Idempotently creates a Google Drive folder for a wedding event.
 *
 * Idempotency strategy (three layers, so retries never create duplicates):
 *   1. If the event already stores a folder id, verify that folder still exists.
 *   2. Otherwise look for an existing app-created folder tagged with this
 *      event's id via `appProperties`.
 *   3. Only then create a new folder.
 *
 * The event document is always updated atomically via $set so concurrent
 * requests cannot lose the association.
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
    const driveError = classifyDriveError(err);
    await Event.updateOne(
      { _id: event._id },
      {
        $set: {
          driveFolderStatus: 'FAILED',
          driveFolderError: driveError.message,
          driveConnectionStatus:
            driveError.code === 'DRIVE_NOT_CONNECTED' ||
            driveError.code === 'DRIVE_NOT_CONFIGURED'
              ? 'NOT_CONNECTED'
              : 'ERROR',
        },
      }
    );
    throw driveError;
  }

  const eventId = String(event._id);
  const folderName = buildEventFolderName(event.title);

  // Layer 1: already associated with a live folder.
  if (event.driveFolderId) {
    try {
      const existing = await drive.files.get({
        fileId: event.driveFolderId,
        fields: 'id, name, webViewLink, trashed, appProperties',
      });

      if (existing.data.id && !existing.data.trashed) {
        await Event.updateOne(
          { _id: event._id },
          {
            $set: {
              driveFolderId: existing.data.id,
              driveFolderName: existing.data.name || folderName,
              driveFolderWebViewLink: existing.data.webViewLink || undefined,
              driveFolderStatus: 'CREATED',
              driveFolderCreatedAt: new Date(),
              driveConnectionStatus: 'CONNECTED',
            },
            // Mongoose ignores `$set: undefined`, so the stale error is removed explicitly.
            $unset: { driveFolderError: 1 },
          }
        );

        return {
          folderId: existing.data.id,
          folderName: existing.data.name || folderName,
          webViewLink: existing.data.webViewLink || undefined,
        };
      }
    } catch (checkErr: any) {
      console.warn(
        `[Google Drive] Existing folder check failed for event ${eventId}: ${checkErr?.message}`
      );
    }
  }

  try {
    await Event.updateOne(
      { _id: event._id },
      { $set: { driveFolderStatus: 'PENDING' }, $unset: { driveFolderError: 1 } }
    );

    // Ensure the dedicated parent folder exists.
    const rootFolderId = await getOrCreateAppRootFolder(drive, photographer);

    // Layer 2: an app-created folder already tagged with this event id.
    let folderId: string | undefined;
    let webViewLink: string | undefined;

    const existingSearch = await drive.files.list({
      q: `'${rootFolderId}' in parents and appProperties has { key='${APP_PROPERTY_EVENT_ID}' and value='${eventId}' } and trashed = false`,
      fields: 'files(id, name, webViewLink, appProperties)',
      spaces: 'drive',
      pageSize: 10,
    });

    const tagged = existingSearch.data.files?.find(
      (file: any) => file.appProperties?.[APP_PROPERTY_EVENT_ID] === eventId
    );

    if (tagged?.id) {
      folderId = tagged.id;
      webViewLink = tagged.webViewLink || undefined;
      console.log(
        `[Google Drive] Reusing existing event folder ${folderId} for event ${eventId}`
      );
    } else {
      // Layer 3: create a new folder tagged with this event id.
      const createRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
          description: `Wedding photo gallery for ${event.title}`,
          appProperties: {
            [APP_PROPERTY_KEY]: APP_PROPERTY_ROOT,
            [APP_PROPERTY_EVENT_ID]: eventId,
          },
        },
        fields: 'id, name, webViewLink, appProperties',
      });

      folderId = createRes.data.id!;
      webViewLink = createRes.data.webViewLink || undefined;
      console.log(
        `[Google Drive] Created event folder ${folderId} for event ${eventId}`
      );
    }

    await Event.updateOne(
      { _id: event._id },
      {
        $set: {
          driveFolderId: folderId,
          driveFolderName: folderName,
          driveFolderWebViewLink: webViewLink,
          driveFolderStatus: 'CREATED',
          driveFolderCreatedAt: new Date(),
          driveConnectionStatus: 'CONNECTED',
        },
        // Mongoose ignores `$set: undefined`, so the stale error is removed explicitly.
        $unset: { driveFolderError: 1 },
      }
    );

    return { folderId: folderId!, folderName, webViewLink };
  } catch (error: any) {
    const driveError = classifyDriveError(error);

    console.error(
      `[Google Drive] Folder creation failed for event ${eventId}: ${driveError.message}`
    );

    if (
      driveError.code === 'DRIVE_RECONNECT_REQUIRED' ||
      driveError.code === 'DRIVE_INSUFFICIENT_SCOPE'
    ) {
      await flagReconnectRequired(photographer._id);
    }

    await Event.updateOne(
      { _id: event._id },
      {
        $set: {
          driveFolderStatus: 'FAILED',
          driveFolderError: driveError.message,
          driveConnectionStatus: 'ERROR',
        },
      }
    );

    throw driveError;
  }
}

/**
 * Revokes the Google OAuth refresh token and clears the stored credentials.
 * Existing Drive folders are intentionally left untouched in the user's Drive.
 */
export async function revokeDriveAccess(photographer: IPhotographer): Promise<void> {
  if (photographer.googleDrive?.refreshTokenEncrypted) {
    try {
      const plainToken = decrypt(photographer.googleDrive.refreshTokenEncrypted);
      const oauth2Client = getOAuth2Client();
      await oauth2Client.revokeToken(plainToken);
    } catch (err: any) {
      console.warn(
        '[Google Drive] Token revocation warning (token may already be expired/revoked):',
        err?.message
      );
    }
  }

  await Photographer.updateOne(
    { _id: photographer._id },
    {
      $set: {
        'googleDrive.connected': false,
        'googleDrive.reconnectRequired': false,
      },
      $unset: {
        'googleDrive.refreshTokenEncrypted': 1,
        'googleDrive.googleEmail': 1,
        'googleDrive.connectedAt': 1,
      },
    }
  );
}
