import mongoose from 'mongoose';
import { google, drive_v3 } from 'googleapis';
import { Photographer } from '../models/Photographer.js';
import { Event } from '../models/Event.js';
import { FaceIndex, IFaceIndex, IndexingJob, indexingJobs, FACE_INDEX_VERSION } from '../models/FaceIndex.js';
import { getDriveClientForPhotographer, DriveClient } from './drive.service.js';
import { classifyDriveError, DriveError } from './drive.service.js';
import {
  analyzeImageBuffer,
  serializeDescriptor,
  ImageFaceAnalysis,
} from './faceRecognition.service.js';
import { env } from '../config/env.js';

const MAX_INDEX_FILES = env.FACE_INDEX_MAX_FILES;
const INDEX_BATCH_SIZE = 5;

function getJobKey(eventId: string): string {
  return `event:${eventId}`;
}

function setJob(eventId: string, partial: Partial<IndexingJob>): void {
  const key = getJobKey(eventId);
  const existing = indexingJobs.get(key) || {
    eventId,
    status: 'IDLE' as const,
    progress: { current: 0, total: 0 },
  };
  indexingJobs.set(key, { ...existing, ...partial });
}

export function getIndexingStatus(eventId: string): IndexingJob {
  return indexingJobs.get(getJobKey(eventId)) || {
    eventId,
    status: 'IDLE',
    progress: { current: 0, total: 0 },
  };
}

export async function listAllImageFilesInFolder(
  drive: drive_v3.Drive,
  folderId: string
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  modifiedTime?: Date;
  parentId?: string;
}>> {
  const allFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    md5Checksum?: string;
    webViewLink?: string;
    thumbnailLink?: string;
    modifiedTime?: Date;
    parentId?: string;
  }> = [];

  async function discoverFolder(currentFolderId: string): Promise<void> {
    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields:
          'files(id, name, mimeType, size, md5Checksum, webViewLink, thumbnailLink, modifiedTime), nextPageToken',
        spaces: 'drive',
        pageSize: 100,
        pageToken,
      });

      const files = res.data.files || [];

      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await discoverFolder(file.id!);
        } else if (file.mimeType?.startsWith('image/')) {
          allFiles.push({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType!,
            size: file.size ?? undefined,
            md5Checksum: (file as any).md5Checksum ?? undefined,
            webViewLink: file.webViewLink ?? undefined,
            thumbnailLink: file.thumbnailLink ?? undefined,
            modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
            parentId: currentFolderId,
          });
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  await discoverFolder(folderId);

  console.log(`[FaceIndex] Discovered ${allFiles.length} image file(s) in Drive folder ${folderId}`);
  allFiles.forEach((f) => {
    console.log(`[FaceIndex]   ${f.name} | ${f.mimeType} | ${f.size ?? '?'} bytes | parent=${f.parentId}`);
  });

  return allFiles;
}

export async function downloadDriveImage(
  drive: drive_v3.Drive,
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(res.data as ArrayBuffer);
  const mimeType = (res.headers['content-type'] as string) || 'application/octet-stream';
  return { buffer, mimeType, size: buffer.length };
}

async function isAlreadyIndexed(
  eventId: mongoose.Types.ObjectId,
  driveFileId: string,
  driveMd5Checksum?: string
): Promise<IFaceIndex | null> {
  const existing = await FaceIndex.findOne({ eventId, driveFileId });
  if (!existing) return null;
  if (driveMd5Checksum && existing.driveMd5Checksum === driveMd5Checksum) return existing;
  return null;
}

export async function indexEventPhotos(
  eventId: string,
  photographerId: string
): Promise<{
  indexed: number;
  skipped: number;
  noFaceImages: number;
  failed: number;
  facesFound: number;
  filesProcessed: number;
  totalDiscovered: number;
  error?: string;
}> {
  const jobKey = getJobKey(eventId);
  setJob(eventId, { status: 'INDEXING', progress: { current: 0, total: 0 }, error: undefined, startedAt: new Date() });

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    if (String(event.photographerId) !== photographerId) {
      throw new Error('Not authorized to index this event');
    }

    if (!event.driveFolderId) {
      throw new Error('Event has no Google Drive folder associated');
    }

    const photographer = await Photographer.findById(event.photographerId);
    if (!photographer || !photographer.googleDrive?.connected) {
      throw new Error('Google Drive is not connected for this event');
    }

    const { drive } = await getDriveClientForPhotographer(photographer);

    const files = await listAllImageFilesInFolder(drive, event.driveFolderId);
    const totalDiscovered = files.length;
    setJob(eventId, { progress: { current: 0, total: totalDiscovered } });

    if (totalDiscovered === 0) {
      console.warn(`[FaceIndex] No image files found in Drive folder ${event.driveFolderId} for event ${eventId}`);
      setJob(eventId, {
        status: 'COMPLETED',
        progress: { current: 0, total: 0 },
        completedAt: new Date(),
      });
      return { indexed: 0, skipped: 0, noFaceImages: 0, failed: 0, facesFound: 0, filesProcessed: 0, totalDiscovered: 0 };
    }

    let indexed = 0;
    let skipped = 0;
    let noFaceImages = 0;
    let failed = 0;
    let facesFound = 0;
    let filesProcessed = 0;

    for (let i = 0; i < files.length; i += INDEX_BATCH_SIZE) {
      const batch = files.slice(i, i + INDEX_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (file) => {
          filesProcessed++;
          setJob(eventId, {
            progress: { current: filesProcessed, total: files.length },
          });

          const existing = await isAlreadyIndexed(event._id, file.id, file.md5Checksum);
          if (existing) {
            return { action: 'skipped' as const, file };
          }

          let imageData: { buffer: Buffer; mimeType: string; size: number };
          try {
            imageData = await downloadDriveImage(drive, file.id);
          } catch (err: any) {
            console.error(`[FaceIndex] Failed to download ${file.id} (${file.name}):`, err.message);
            return { action: 'error' as const, file, error: err.message };
          }

          if (imageData.size > 20 * 1024 * 1024) {
            return { action: 'skipped' as const, file, reason: 'file too large' };
          }

          let analysis: ImageFaceAnalysis;
          try {
            analysis = await analyzeImageBuffer(imageData.buffer, imageData.mimeType);
          } catch (err: any) {
            console.error(`[FaceIndex] Face detection failed for ${file.id} (${file.name}):`, err.message);
            return { action: 'error' as const, file, error: err.message };
          }

          if (analysis.faceCount === 0) {
            console.log(`[FaceIndex] No faces detected in ${file.name} (${file.id})`);
            return { action: 'no_faces' as const, file, faces: 0 };
          }

          const faceIndexDoc: Partial<IFaceIndex> = {
            eventId: event._id,
            driveFileId: file.id,
            driveFileName: file.name,
            driveThumbnailLink: file.thumbnailLink,
            driveWebViewLink: file.webViewLink,
            driveMd5Checksum: file.md5Checksum,
            driveModifiedTime: file.modifiedTime,
            imageWidth: analysis.imageWidth,
            imageHeight: analysis.imageHeight,
            imageSizeBytes: imageData.size,
            mimeType: imageData.mimeType,
            faceCount: analysis.faceCount,
            faceDescriptors: analysis.detections.map((d) => serializeDescriptor(d.descriptor)),
            faceBoxes: analysis.detections.map((d) => d.box),
            indexedAt: new Date(),
            indexedVersion: FACE_INDEX_VERSION,
          };

          await FaceIndex.findOneAndUpdate(
            { eventId: event._id, driveFileId: file.id },
            { $set: faceIndexDoc },
            { upsert: true, new: true }
          );

          return { action: 'indexed' as const, file, faces: analysis.faceCount };
        })
      );

      for (const result of results) {
        if (result.action === 'indexed') {
          indexed++;
          facesFound += result.faces;
          console.log(`[FaceIndex] Indexed ${result.file.name}: ${result.faces} face(s) detected`);
        } else if (result.action === 'skipped') {
          skipped++;
        } else if (result.action === 'no_faces') {
          noFaceImages++;
        } else if (result.action === 'error') {
          failed++;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setJob(eventId, {
      status: 'COMPLETED',
      progress: { current: filesProcessed, total: files.length },
      completedAt: new Date(),
      totalDiscovered,
      indexedCount: indexed,
      noFaceImages,
      failed,
      facesFound,
    });

    console.log(`[FaceIndex] Indexing complete for event ${eventId}: ${indexed} indexed, ${noFaceImages} no-face, ${failed} failed, ${skipped} skipped, ${facesFound} total faces, ${totalDiscovered} discovered`);

    return { indexed, skipped, noFaceImages, failed, facesFound, filesProcessed, totalDiscovered };
  } catch (error: any) {
    setJob(eventId, {
      status: 'FAILED',
      error: error.message || 'Indexing failed',
      completedAt: new Date(),
    });
    return { indexed: 0, skipped: 0, noFaceImages: 0, failed: 0, facesFound: 0, filesProcessed: 0, totalDiscovered: 0, error: error.message };
  }
}

export async function clearEventIndex(eventId: string): Promise<void> {
  await FaceIndex.deleteMany({ eventId });
  indexingJobs.delete(getJobKey(eventId));
}
