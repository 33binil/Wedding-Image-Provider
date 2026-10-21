import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAdminAuditLog extends Document {
  adminId?: Types.ObjectId;
  adminEmail?: string;
  action: string;
  targetType: 'PHOTOGRAPHER' | 'INVITATION' | 'SYSTEM';
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'Photographer',
      index: true,
    },
    adminEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    targetType: {
      type: String,
      enum: ['PHOTOGRAPHER', 'INVITATION', 'SYSTEM'],
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      trim: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

AdminAuditLogSchema.index({ timestamp: -1 });

export const AdminAuditLog = mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);
