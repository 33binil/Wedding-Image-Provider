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

export interface ILoginOtp {
  codeHash?: string;
  expiresAt?: Date;
  failedAttempts: number;
  isUsed: boolean;
  usedAt?: Date;
  generatedAt?: Date;
  generatedBy?: mongoose.Types.ObjectId;
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
  loginOtp?: ILoginOtp;
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
    loginOtp: {
      codeHash: {
        type: String,
      },
      expiresAt: {
        type: Date,
      },
      failedAttempts: {
        type: Number,
        default: 0,
      },
      isUsed: {
        type: Boolean,
        default: false,
      },
      usedAt: {
        type: Date,
      },
      generatedAt: {
        type: Date,
      },
      generatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Photographer',
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).passwordHash;
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
PhotographerSchema.index({ 'loginOtp.expiresAt': 1 });

export const Photographer = mongoose.model<IPhotographer>('Photographer', PhotographerSchema);
