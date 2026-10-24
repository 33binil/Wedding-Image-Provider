import mongoose, { Document, Schema, Types } from 'mongoose';

export type IndexingStatus = 'IDLE' | 'INDEXING' | 'COMPLETED' | 'FAILED';

export interface IFaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IFaceIndex extends Document {
  eventId: Types.ObjectId;
  driveFileId: string;
  driveFileName: string;
  driveThumbnailLink?: string;
  driveWebViewLink?: string;
  driveMd5Checksum?: string;
  driveModifiedTime?: Date;
  imageWidth: number;
  imageHeight: number;
  imageSizeBytes: number;
  mimeType: string;
  faceCount: number;
  faceDescriptors: number[][];
  faceBoxes: IFaceBoundingBox[];
  indexedAt: Date;
  indexedVersion: string;
}

const FaceIndexSchema = new Schema<IFaceIndex>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true,
    },
    driveFileId: {
      type: String,
      required: [true, 'Drive file ID is required'],
      index: true,
    },
    driveFileName: {
      type: String,
      required: [true, 'Drive file name is required'],
      trim: true,
    },
    driveThumbnailLink: {
      type: String,
      trim: true,
    },
    driveWebViewLink: {
      type: String,
      trim: true,
    },
    driveMd5Checksum: {
      type: String,
      trim: true,
    },
    driveModifiedTime: {
      type: Date,
    },
    imageWidth: {
      type: Number,
      required: [true, 'Image width is required'],
      min: 1,
    },
    imageHeight: {
      type: Number,
      required: [true, 'Image height is required'],
      min: 1,
    },
    imageSizeBytes: {
      type: Number,
      required: [true, 'Image size is required'],
      min: 0,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      trim: true,
    },
    faceCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    faceDescriptors: {
      type: [[Number]],
      required: true,
      default: [],
      validate: {
        validator: function (v: number[][]) {
          return v.every((d) => Array.isArray(d) && d.length === 128);
        },
        message: 'Each face descriptor must be a 128-dimensional array',
      },
    },
    faceBoxes: {
      type: [
        {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          width: { type: Number, required: true },
          height: { type: Number, required: true },
        },
      ],
      default: [],
    },
    indexedAt: {
      type: Date,
      required: [true, 'Indexed at is required'],
    },
    indexedVersion: {
      type: String,
      required: [true, 'Indexed version is required'],
      trim: true,
    },
  },
  { timestamps: true }
);

FaceIndexSchema.index({ eventId: 1, driveFileId: 1 }, { unique: true });
FaceIndexSchema.index({ eventId: 1, indexedAt: -1 });

export const FaceIndex = mongoose.model<IFaceIndex>('FaceIndex', FaceIndexSchema);

export interface IndexingJob {
  eventId: string;
  status: IndexingStatus;
  progress: { current: number; total: number };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  totalDiscovered?: number;
  indexedCount?: number;
  noFaceImages?: number;
  failed?: number;
  facesFound?: number;
}

export const indexingJobs = new Map<string, IndexingJob>();

export const FACE_INDEX_VERSION = 'face-api-v1';

export const FACE_DETECTION_MIN_CONFIDENCE = 0.5;

export const DEFAULT_SIMILARITY_THRESHOLD = 0.65;
