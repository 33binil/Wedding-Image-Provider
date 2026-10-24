import { Event } from '../models/Event.js';
import { FaceIndex, IFaceIndex, DEFAULT_SIMILARITY_THRESHOLD } from '../models/FaceIndex.js';
import { deserializeDescriptor, cosineSimilarity } from './faceRecognition.service.js';
import { env } from '../config/env.js';

export interface FaceMatchResult {
  folderId: string;
  fileName: string;
  webViewLink?: string;
  thumbnailLink?: string;
  similarity: number;
}

export interface FaceMatchResponse {
  matches: FaceMatchResult[];
  totalScanned: number;
  processingTimeMs: number;
  error?: string;
}

export interface SelfieAnalysis {
  descriptor: Float32Array;
  faceCount: number;
}

export class FaceMatchService {
  async matchSelfieToEventPhotos(
    eventId: string,
    selfieDescriptor: Float32Array
  ): Promise<FaceMatchResponse> {
    const startTime = Date.now();

    try {
      const event = await Event.findById(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      const indexedFaces = await FaceIndex.find({ eventId: event._id }).lean();
      if (indexedFaces.length === 0) {
        return {
          matches: [],
          totalScanned: 0,
          processingTimeMs: Date.now() - startTime,
          error:
            "This event's photo library hasn't been indexed yet. Please ask the photographer to index the wedding photos first.",
        };
      }

      const threshold = env.FACE_MATCH_THRESHOLD;

      const matches: FaceMatchResult[] = [];

      for (const doc of indexedFaces as IFaceIndex[]) {
        if (!doc.faceDescriptors || doc.faceDescriptors.length === 0) continue;

        let bestSimilarity = 0;
        for (const descriptorArr of doc.faceDescriptors) {
          try {
            const storedDescriptor = deserializeDescriptor(descriptorArr);
            const sim = cosineSimilarity(selfieDescriptor, storedDescriptor);
            if (sim > bestSimilarity) bestSimilarity = sim;
          } catch {
            continue;
          }
        }

        if (bestSimilarity >= threshold) {
          matches.push({
            folderId: doc.driveFileId,
            fileName: doc.driveFileName,
            webViewLink: doc.driveWebViewLink,
            thumbnailLink: doc.driveThumbnailLink,
            similarity: bestSimilarity,
          });
        }
      }

      matches.sort((a, b) => b.similarity - a.similarity);

      return {
        matches,
        totalScanned: indexedFaces.length,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        matches: [],
        totalScanned: 0,
        processingTimeMs: Date.now() - startTime,
        error: error.message || 'Face matching failed',
      };
    }
  }
}

export const faceMatchService = new FaceMatchService();
