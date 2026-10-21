import mongoose, { Document, Schema, Types } from 'mongoose';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface IInvitation extends Document {
  email: string;
  studioName: string;
  codeHash: string;
  status: InvitationStatus;
  trialDays: number;
  expiresAt: Date;
  trialExpiresAt: Date;
  usedAt?: Date;
  createdBy?: Types.ObjectId;
  failedAttempts: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    studioName: {
      type: String,
      required: [true, 'Studio or photographer name is required'],
      trim: true,
      maxlength: 120,
    },
    codeHash: {
      type: String,
      required: [true, 'Activation code hash is required'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    trialDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Invitation expiry date is required'],
      index: true,
    },
    trialExpiresAt: {
      type: Date,
      required: [true, 'Trial expiry date is required'],
    },
    usedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Photographer',
    },
    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).codeHash;
        return ret;
      },
    },
  }
);

// Compound indexes for fast lookups
InvitationSchema.index({ email: 1, status: 1 });
InvitationSchema.index({ expiresAt: 1, status: 1 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
