import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'PHOTOGRAPHER' | 'SUPERADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface IGoogleDrive {
  connected: boolean;
  googleEmail?: string;
  refreshTokenEncrypted?: string;
  connectedAt?: Date;
  rootFolderId?: string;
  reconnectRequired?: boolean;
}

export interface IPhotographer extends Document {
  name: string;
  email: string;
  /** Only set for the platform superadmin, who signs in with a password. */
  passwordHash?: string;
  /** Firebase UID for photographers who sign in with Google. */
  firebaseUid?: string;
  firebaseLinkedAt?: Date;
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
    },
    // Photographers authenticate with Firebase Google Sign-In, so no password
    // hash is stored for them. The superadmin still uses a password.
    passwordHash: {
      type: String,
    },
    firebaseUid: {
      type: String,
      trim: true,
    },
    firebaseLinkedAt: {
      type: Date,
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
      default: 'PENDING',
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
      rootFolderId: {
        type: String,
        trim: true,
      },
      reconnectRequired: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).passwordHash;
        delete (ret as any).firebaseUid;
        // Legacy records may still carry a loginOtp sub-document from the
        // retired OTP flow. It is no longer part of the schema, so it is
        // stripped explicitly to keep it out of API responses.
        delete (ret as any).loginOtp;
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
// Unique index so a single Firebase UID can only be bound to one account.
PhotographerSchema.index({ firebaseUid: 1 }, { unique: true, sparse: true });

export const Photographer = mongoose.model<IPhotographer>('Photographer', PhotographerSchema);
