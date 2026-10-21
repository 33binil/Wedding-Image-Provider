import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'PHOTOGRAPHER' | 'SUPERADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface IGoogleDrive {
  connected: boolean;
  googleEmail?: string;
  refreshTokenEncrypted?: string;
  connectedAt?: Date;
}

export interface IPhotographer extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  trialStartAt?: Date;
  trialExpiresAt?: Date;
  googleDrive: IGoogleDrive;
  createdAt: Date;
  updatedAt: Date;
}

const PhotographerSchema = new Schema<IPhotographer>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: ['PHOTOGRAPHER', 'SUPERADMIN'],
      default: 'PHOTOGRAPHER',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
      default: 'ACTIVE',
      index: true,
    },
    trialStartAt: {
      type: Date,
    },
    trialExpiresAt: {
      type: Date,
      index: true,
    },
    googleDrive: {
      connected: {
        type: Boolean,
        default: false,
      },
      googleEmail: {
        type: String,
        trim: true,
      },
      refreshTokenEncrypted: {
        type: String,
      },
      connectedAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).passwordHash;
        if (ret.googleDrive) {
          delete (ret.googleDrive as any).refreshTokenEncrypted;
        }
        return ret;
      },
    },
  }
);

// Indexes
PhotographerSchema.index({ role: 1, status: 1 });
PhotographerSchema.index({ email: 1 }, { unique: true });

export const Photographer = mongoose.model<IPhotographer>('Photographer', PhotographerSchema);
