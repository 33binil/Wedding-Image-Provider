import mongoose, { Document, Schema, Types } from 'mongoose';

export type DriveConnectionStatus = 'NOT_CONNECTED' | 'CONNECTED' | 'ERROR';
export type DriveFolderStatus = 'NOT_CONNECTED' | 'PENDING' | 'CREATED' | 'FAILED';
export type EventStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface IEvent extends Document {
  photographerId: Types.ObjectId;
  title: string;
  brideName?: string;
  groomName?: string;
  eventDate: Date;
  venue?: string;
  description?: string;
  coverImageUrl?: string;
  publicToken: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderWebViewLink?: string;
  driveFolderStatus: DriveFolderStatus;
  driveFolderError?: string;
  driveConnectionStatus: DriveConnectionStatus;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    photographerId: {
      type: Schema.Types.ObjectId,
      ref: 'Photographer',
      required: [true, 'Photographer ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Wedding event title is required'],
      trim: true,
      maxlength: 200,
    },
    brideName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    groomName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    eventDate: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    venue: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    coverImageUrl: {
      type: String,
      trim: true,
    },
    publicToken: {
      type: String,
      required: [true, 'Public token is required'],
      unique: true,
      index: true,
      trim: true,
    },
    driveFolderId: {
      type: String,
      trim: true,
    },
    driveFolderName: {
      type: String,
      trim: true,
    },
    driveFolderWebViewLink: {
      type: String,
      trim: true,
    },
    driveFolderStatus: {
      type: String,
      enum: ['NOT_CONNECTED', 'PENDING', 'CREATED', 'FAILED'],
      default: 'NOT_CONNECTED',
    },
    driveFolderError: {
      type: String,
      trim: true,
    },
    driveConnectionStatus: {
      type: String,
      enum: ['NOT_CONNECTED', 'CONNECTED', 'ERROR'],
      default: 'NOT_CONNECTED',
    },
    status: {
      type: String,
      enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
      default: 'UPCOMING',
    },
  },
  {
    timestamps: true,
  }
);

// Composite index for fast queries by photographer ordered by date
EventSchema.index({ photographerId: 1, eventDate: -1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);
