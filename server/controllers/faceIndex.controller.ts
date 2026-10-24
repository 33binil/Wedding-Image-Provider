import { Request, Response, NextFunction } from 'express';
import { Event } from '../models/Event.js';
import { indexEventPhotos, getIndexingStatus, clearEventIndex } from '../services/faceIndex.service.js';
import { FaceIndex } from '../models/FaceIndex.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export async function startIndexing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { eventId } = req.params;
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    if (String(event.photographerId) !== String(user._id)) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not authorized to index this event' });
      return;
    }

    const existing = getIndexingStatus(eventId);
    if (existing.status === 'INDEXING') {
      res.status(409).json({
        success: false,
        error: 'INDEXING_IN_PROGRESS',
        message: 'Indexing is already in progress for this event',
      });
      return;
    }

    indexEventPhotos(eventId, String(user._id)).then((result) => {
      if (result.error) {
        console.error(`[FaceIndex] Indexing failed for event ${eventId}:`, result.error);
      }
    });

    res.status(202).json({
      success: true,
      message: 'Indexing started',
      data: { eventId, status: 'INDEXING' },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function getIndexingStatusHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { eventId } = req.params;
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    if (String(event.photographerId) !== String(user._id)) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not authorized' });
      return;
    }

    const status = getIndexingStatus(eventId);
    const indexedCount = await FaceIndex.countDocuments({ eventId });

    res.status(200).json({
      success: true,
      data: {
        eventId,
        status: status.status,
        progress: status.progress,
        error: status.error,
        indexedCount: status.indexedCount ?? indexedCount,
        totalDiscovered: status.totalDiscovered,
        noFaceImages: status.noFaceImages,
        failed: status.failed,
        facesFound: status.facesFound,
        startedAt: status.startedAt,
        completedAt: status.completedAt,
      },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function getPublicIndexingStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    const event = await Event.findOne({ publicToken: token }).select('_id title status driveFolderId driveFolderStatus');
    if (!event) {
      res.status(404).json({ success: false, error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    const status = getIndexingStatus(event._id.toString());
    const indexedCount = await FaceIndex.countDocuments({ eventId: event._id });

    res.status(200).json({
      success: true,
      data: {
        eventId: event._id,
        eventTitle: event.title,
        status: status.status,
        progress: status.progress,
        indexedCount: status.indexedCount ?? indexedCount,
        totalDiscovered: status.totalDiscovered,
        noFaceImages: status.noFaceImages,
        failed: status.failed,
        facesFound: status.facesFound,
        error: status.error,
        driveFolderStatus: event.driveFolderStatus,
      },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function resetIndexing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { eventId } = req.params;
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    if (String(event.photographerId) !== String(user._id)) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not authorized' });
      return;
    }

    await clearEventIndex(eventId);

    res.status(200).json({ success: true, message: 'Index reset successfully' });
  } catch (error: any) {
    next(error);
  }
}
