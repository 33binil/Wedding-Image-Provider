import { Request, Response, NextFunction } from 'express';
import { Event } from '../models/Event.js';
import { faceMatchService } from '../services/faceMatch.service.js';
import { analyzeSelfieBuffer } from '../services/faceRecognition.service.js';

const MAX_SELFIE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_SELFIE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
}

function estimateBase64Size(base64: string): number {
  return (base64.length * 3) / 4;
}

export async function getPublicEvent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'A valid wedding public token is required.',
      });
      return;
    }

    const event = await Event.findOne({ publicToken: token }).select(
      'title brideName groomName eventDate venue description coverImageUrl publicToken status createdAt'
    );

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'This wedding event page could not be found. Please check your invitation link.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        event: {
          title: event.title,
          brideName: event.brideName,
          groomName: event.groomName,
          eventDate: event.eventDate,
          venue: event.venue,
          description: event.description,
          coverImageUrl: event.coverImageUrl,
          publicToken: event.publicToken,
          status: event.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function matchSelfieToEvent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;
    const { selfieImageData } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'A valid wedding public token is required.',
      });
      return;
    }

    if (!selfieImageData || typeof selfieImageData !== 'string') {
      res.status(400).json({
        success: false,
        error: 'INVALID_SELFIE',
        message: 'A selfie image is required for face matching.',
      });
      return;
    }

    const parsed = parseDataUrl(selfieImageData);
    if (!parsed) {
      res.status(400).json({
        success: false,
        error: 'INVALID_SELFIE',
        message: 'Selfie must be a valid image data URL.',
      });
      return;
    }

    if (!ALLOWED_SELFIE_MIME_TYPES.includes(parsed.mimeType)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_SELFIE',
        message: 'Selfie must be a JPEG, PNG, or WebP image.',
      });
      return;
    }

    const sizeBytes = estimateBase64Size(parsed.base64);
    if (sizeBytes > MAX_SELFIE_SIZE_BYTES) {
      res.status(400).json({
        success: false,
        error: 'SELFIE_TOO_LARGE',
        message: 'Selfie image is too large. Maximum size is 10 MB.',
      });
      return;
    }

    const event = await Event.findOne({ publicToken: token }).select(
      '_id photographerId title publicToken driveFolderId'
    );

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'This wedding event page could not be found. Please check your invitation link.',
      });
      return;
    }

    let selfieDescriptor: Float32Array;
    try {
      const buffer = Buffer.from(parsed.base64, 'base64');
      const analysis = await analyzeSelfieBuffer(buffer, parsed.mimeType);
      selfieDescriptor = analysis.detections[0].descriptor;
    } catch (err: any) {
      if (err.message === 'NO_FACE_DETECTED') {
        res.status(400).json({
          success: false,
          error: 'NO_FACE_DETECTED',
          message: 'No face detected in your selfie. Please try again with a clearer photo of your face.',
        });
        return;
      }
      if (err.message === 'MULTIPLE_FACES_DETECTED') {
        res.status(400).json({
          success: false,
          error: 'MULTIPLE_FACES_DETECTED',
          message: 'Multiple faces detected in your selfie. Please use a selfie with only one face.',
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: 'SELFIE_ANALYSIS_FAILED',
        message: 'Unable to analyze your selfie. Please try again.',
      });
      return;
    }

    const result = await faceMatchService.matchSelfieToEventPhotos(
      event._id.toString(),
      selfieDescriptor
    );

    res.status(200).json({
      success: true,
      data: {
        event: {
          _id: event._id,
          title: event.title,
          publicToken: event.publicToken,
        },
        matches: result.matches,
        totalScanned: result.totalScanned,
        processingTimeMs: result.processingTimeMs,
        error: result.error,
      },
    });
  } catch (error) {
    next(error);
  }
}
