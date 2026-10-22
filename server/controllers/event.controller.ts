import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Event, EventStatus } from '../models/Event.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { createEventFolderInDrive } from '../services/drive.service.js';
import QRCode from 'qrcode';

const createEventSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  brideName: z.string().trim().max(100).optional().or(z.literal('')),
  groomName: z.string().trim().max(100).optional().or(z.literal('')),
  eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Please provide a valid date',
  }),
  venue: z.string().trim().max(200).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  coverImageUrl: z.string().trim().url('Invalid cover image URL').optional().or(z.literal('')),
});

const updateEventSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  brideName: z.string().trim().max(100).optional(),
  groomName: z.string().trim().max(100).optional(),
  eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Please provide a valid date',
  }).optional(),
  venue: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  coverImageUrl: z.string().trim().url('Invalid cover image URL').optional().or(z.literal('')),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as [EventStatus, ...EventStatus[]]).optional(),
  // NOTE: driveFolderId / driveFolderName / driveFolderWebViewLink /
  // driveFolderStatus / driveConnectionStatus are deliberately NOT writable
  // from the client. They are owned exclusively by the server-side Google
  // Drive integration so a photographer cannot point their event at another
  // photographer's Drive folder.
});

export async function createEvent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = createEventSchema.parse(req.body);

    // Generate unique cryptographically random token (32 hex characters)
    const publicToken = crypto.randomBytes(16).toString('hex');

    const event = await Event.create({
      photographerId: req.user!._id,
      title: validated.title,
      brideName: validated.brideName || undefined,
      groomName: validated.groomName || undefined,
      eventDate: new Date(validated.eventDate),
      venue: validated.venue || undefined,
      description: validated.description || undefined,
      coverImageUrl: validated.coverImageUrl || undefined,
      publicToken,
      driveConnectionStatus: 'NOT_CONNECTED',
      driveFolderStatus: 'NOT_CONNECTED',
      driveFolderAttempts: 0,
      status: 'UPCOMING',
    });

    let driveMessage = 'Connect Google Drive to create the folder automatically.';

    // If photographer has Google Drive connected, automatically create event folder
    if (req.user?.googleDrive?.connected) {
      try {
        await createEventFolderInDrive(req.user, event);
        driveMessage = 'Google Drive event folder created automatically.';
      } catch (driveErr: any) {
        console.warn(
          `[Event Create] Automatic Google Drive folder creation deferred for event ${event._id}: ${driveErr?.message}`
        );
        driveMessage =
          'Event created successfully. Google Drive folder creation failed and can be retried anytime.';
      }
    }

    // Re-read so the response reflects the folder state written by the
    // Drive integration (CREATED / FAILED / PENDING).
    const persistedEvent = await Event.findById(event._id);

    res.status(201).json({
      success: true,
      message: 'Wedding event created successfully',
      data: {
        event: persistedEvent,
        driveMessage,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listEvents(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, search } = req.query;

    const query: any = {
      photographerId: req.user!._id,
    };

    if (status && typeof status === 'string' && status !== 'ALL') {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { brideName: { $regex: term, $options: 'i' } },
        { groomName: { $regex: term, $options: 'i' } },
        { venue: { $regex: term, $options: 'i' } },
      ];
    }

    const events = await Event.find(query).sort({ eventDate: 1, createdAt: -1 });

    // Calculate quick counts for dashboard
    const allEvents = await Event.find({ photographerId: req.user!._id });
    const stats = {
      total: allEvents.length,
      upcoming: allEvents.filter((e) => e.status === 'UPCOMING').length,
      active: allEvents.filter((e) => e.status === 'ACTIVE').length,
      completed: allEvents.filter((e) => e.status === 'COMPLETED').length,
    };

    res.status(200).json({
      success: true,
      data: {
        events,
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getEventById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid event identifier',
      });
      return;
    }

    const event = await Event.findOne({
      _id: id,
      photographerId: req.user!._id,
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found or you do not have permission to access it.',
      });
      return;
    }

    // Generate QR Code data URL for the public URL
    const publicUrl = `${req.protocol}://${req.get('host')}/w/${event.publicToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1C1917',
        light: '#FFFFFF',
      },
    });

    res.status(200).json({
      success: true,
      data: {
        event,
        publicUrl,
        qrCodeDataUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid event identifier',
      });
      return;
    }

    const validated = updateEventSchema.parse(req.body);

    const updatePayload: any = { ...validated };
    if (validated.eventDate) {
      updatePayload.eventDate = new Date(validated.eventDate);
    }

    const event = await Event.findOneAndUpdate(
      {
        _id: id,
        photographerId: req.user!._id,
      },
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found or you do not have permission to modify it.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: {
        event,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid event identifier',
      });
      return;
    }

    const event = await Event.findOneAndDelete({
      _id: id,
      photographerId: req.user!._id,
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found or you do not have permission to delete it.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function retryDriveFolder(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid event identifier',
      });
      return;
    }

    // Ownership is enforced in the query: a photographer can only retry
    // folder creation for their own event.
    const event = await Event.findOne({
      _id: id,
      photographerId: req.user!._id,
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found or you do not have permission to access it.',
      });
      return;
    }

    if (!req.user!.googleDrive?.connected) {
      res.status(400).json({
        success: false,
        error: 'DRIVE_NOT_CONNECTED',
        message:
          'Google Drive is not connected to your studio account. Please connect Google Drive first.',
      });
      return;
    }

    // Track the attempt count so repeated failures are observable.
    await Event.updateOne(
      { _id: event._id },
      { $inc: { driveFolderAttempts: 1 } }
    );

    // Retrying never creates a new event — it only (re)associates the Drive
    // folder with the existing event, idempotently.
    const folderResult = await createEventFolderInDrive(req.user!, event);

    const updatedEvent = await Event.findById(event._id);

    res.status(200).json({
      success: true,
      message: 'Google Drive folder created and associated successfully.',
      data: {
        event: updatedEvent,
        folder: folderResult,
      },
    });
  } catch (error: any) {
    if (error?.code && error?.status) {
      res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function getEventDriveFolder(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid event identifier',
      });
      return;
    }

    const event = await Event.findOne({
      _id: id,
      photographerId: req.user!._id,
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found or you do not have permission to access it.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        driveFolderId: event.driveFolderId,
        driveFolderName: event.driveFolderName,
        driveFolderWebViewLink: event.driveFolderWebViewLink,
        driveFolderStatus: event.driveFolderStatus,
        driveFolderError: event.driveFolderError,
        driveFolderCreatedAt: event.driveFolderCreatedAt,
        driveFolderAttempts: event.driveFolderAttempts ?? 0,
        driveConnectionStatus: event.driveConnectionStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}
