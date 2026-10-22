import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { Types } from 'mongoose';

export interface AuditLogParams {
  adminId?: Types.ObjectId | string;
  adminEmail?: string;
  action: string;
  targetType: 'PHOTOGRAPHER' | 'INVITATION' | 'SYSTEM';
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

export async function logAdminAction(params: AuditLogParams): Promise<void> {
  try {
    // Sanitize metadata to guarantee no secrets, passwords, or hashes are stored
    const safeMetadata = params.metadata ? { ...params.metadata } : {};
    delete safeMetadata.password;
    delete safeMetadata.passwordHash;
    delete safeMetadata.code;
    delete safeMetadata.codeHash;
    delete safeMetadata.otp;
    delete safeMetadata.otpHash;
    delete safeMetadata.token;
    delete safeMetadata.refreshToken;

    await AdminAuditLog.create({
      adminId: params.adminId ? new Types.ObjectId(params.adminId.toString()) : undefined,
      adminEmail: params.adminEmail,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: safeMetadata,
      ipAddress: params.ipAddress,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
