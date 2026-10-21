export type EventStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type DriveConnectionStatus = 'NOT_CONNECTED' | 'CONNECTED' | 'ERROR';
export type UserRole = 'PHOTOGRAPHER' | 'SUPERADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface AccessControlResult {
  allowed: boolean;
  canCreateWeddings: boolean;
  canEditWeddings: boolean;
  canViewGalleries: boolean;
  isSuspended: boolean;
  isTrialExpired: boolean;
  trialDaysRemaining: number;
  reason?: 'SUSPENDED' | 'TRIAL_EXPIRED';
  message?: string;
}

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  trialStartAt?: string;
  trialExpiresAt?: string;
  googleDrive: {
    connected: boolean;
    googleEmail?: string;
    connectedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  weddingsCount?: number;
  trialDaysRemaining?: number;
  isTrialExpired?: boolean;
}

export interface WeddingEvent {
  _id: string;
  photographerId: string;
  title: string;
  brideName?: string;
  groomName?: string;
  eventDate: string;
  venue?: string;
  description?: string;
  coverImageUrl?: string;
  publicToken: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveConnectionStatus: DriveConnectionStatus;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventStats {
  total: number;
  upcoming: number;
  active: number;
  completed: number;
}

export interface PublicEvent {
  title: string;
  brideName?: string;
  groomName?: string;
  eventDate: string;
  venue?: string;
  description?: string;
  coverImageUrl?: string;
  publicToken: string;
  status: EventStatus;
}

export interface DriveStatusResponse {
  configured: boolean;
  connected: boolean;
  googleEmail?: string;
  connectedAt?: string;
}

export interface Invitation {
  _id: string;
  email: string;
  studioName: string;
  status: InvitationStatus;
  trialDays: number;
  expiresAt: string;
  trialExpiresAt: string;
  usedAt?: string;
  failedAttempts: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdminStats {
  totalPhotographers: number;
  activePhotographers: number;
  suspendedPhotographers: number;
  pendingInvitations: number;
  activeTrials: number;
  expiredTrials: number;
  totalWeddings: number;
}

export interface AdminAuditLogEntry {
  _id: string;
  adminEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}
