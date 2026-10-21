import { IPhotographer } from '../models/Photographer.js';

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

export function isTrialExpired(photographer: IPhotographer): boolean {
  if (photographer.role === 'SUPERADMIN') return false;
  if (!photographer.trialExpiresAt) return false;
  return new Date() > new Date(photographer.trialExpiresAt);
}

export function calculateDaysRemaining(trialExpiresAt?: Date): number {
  if (!trialExpiresAt) return 0;
  const now = new Date().getTime();
  const expiry = new Date(trialExpiresAt).getTime();
  const diff = expiry - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function evaluatePhotographerAccess(photographer: IPhotographer): AccessControlResult {
  // Superadmins have full access
  if (photographer.role === 'SUPERADMIN') {
    return {
      allowed: true,
      canCreateWeddings: true,
      canEditWeddings: true,
      canViewGalleries: true,
      isSuspended: false,
      isTrialExpired: false,
      trialDaysRemaining: 9999,
    };
  }

  // Suspended account restriction: completely blocked from photographer operations
  if (photographer.status === 'SUSPENDED') {
    return {
      allowed: false,
      canCreateWeddings: false,
      canEditWeddings: false,
      canViewGalleries: false,
      isSuspended: true,
      isTrialExpired: isTrialExpired(photographer),
      trialDaysRemaining: calculateDaysRemaining(photographer.trialExpiresAt),
      reason: 'SUSPENDED',
      message: 'Your studio account has been suspended by Penta Prizm administrators. Please contact support.',
    };
  }

  const trialExpired = isTrialExpired(photographer);
  const daysRemaining = calculateDaysRemaining(photographer.trialExpiresAt);

  // Expired trial restriction: read-only access to existing events, cannot create new or modify existing weddings
  if (trialExpired) {
    return {
      allowed: true, // can log in and view existing galleries
      canCreateWeddings: false,
      canEditWeddings: false,
      canViewGalleries: true,
      isSuspended: false,
      isTrialExpired: true,
      trialDaysRemaining: 0,
      reason: 'TRIAL_EXPIRED',
      message: 'Your studio trial period has expired. Creating or editing weddings is disabled until renewed.',
    };
  }

  // Active photographer within trial
  return {
    allowed: true,
    canCreateWeddings: true,
    canEditWeddings: true,
    canViewGalleries: true,
    isSuspended: false,
    isTrialExpired: false,
    trialDaysRemaining: daysRemaining,
  };
}
