import { Request, Response, NextFunction } from 'express';
import { verifyPhotographerSession, verifySuperAdminSession } from '../utils/tokens.js';
import { Photographer, IPhotographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { evaluatePhotographerAccess } from '../services/accessControl.service.js';

export interface AuthenticatedRequest extends Request {
  user?: IPhotographer;
  superAdmin?: IPhotographer;
}

/**
 * Requires a valid photographer session.
 *
 * Superadmin sessions are explicitly rejected here: the two surfaces use
 * separate cookies AND separate token types.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token = req.cookies?.[env.COOKIE_NAME];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication session not found. Please sign in with Google.',
      });
      return;
    }

    const payload = verifyPhotographerSession(token);
    const user = await Photographer.findById(payload.id);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Photographer account no longer exists.',
      });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Your session has expired or is invalid. Please sign in again.',
    });
  }
}

/**
 * Ensures the photographer's account is not suspended.
 */
export async function requireActivePhotographer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication session required.',
    });
    return;
  }

  const access = evaluatePhotographerAccess(req.user);
  if (access.isSuspended) {
    res.status(403).json({
      success: false,
      error: 'ACCOUNT_SUSPENDED',
      message: access.message || 'Your photographer studio account has been suspended by Penta Prizm.',
    });
    return;
  }

  next();
}

/**
 * Ensures the photographer's account has an active trial or valid subscription
 * before creating or modifying wedding events.
 */
export async function requireActiveSubscriptionOrTrial(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication session required.',
    });
    return;
  }

  const access = evaluatePhotographerAccess(req.user);

  if (access.isSuspended) {
    res.status(403).json({
      success: false,
      error: 'ACCOUNT_SUSPENDED',
      message: access.message || 'Your photographer studio account has been suspended.',
    });
    return;
  }

  if (access.isTrialExpired) {
    res.status(403).json({
      success: false,
      error: 'TRIAL_EXPIRED',
      message:
        access.message ||
        'Your studio trial period has expired. Please contact Penta Prizm administrators to renew or upgrade your plan.',
    });
    return;
  }

  next();
}

/**
 * Enforces server-side authorization for Penta Prizm Superadmin routes.
 * A photographer must never access superadmin APIs or data by changing URLs or headers.
 */
export async function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token = req.cookies?.[env.SUPERADMIN_COOKIE_NAME];

    if (!token && req.headers['x-superadmin-token']) {
      token = req.headers['x-superadmin-token'] as string;
    }

    // Also check standard Bearer if specifically marked for superadmin
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'SUPERADMIN_UNAUTHORIZED',
        message: 'Superadmin credentials or session cookie not found.',
      });
      return;
    }

    const payload = verifySuperAdminSession(token);
    const admin = await Photographer.findById(payload.id);

    if (!admin || admin.role !== 'SUPERADMIN') {
      res.status(403).json({
        success: false,
        error: 'SUPERADMIN_FORBIDDEN',
        message: 'Forbidden. Access restricted exclusively to Penta Prizm administrators.',
      });
      return;
    }

    if (admin.status === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Administrator account suspended.',
      });
      return;
    }

    req.superAdmin = admin;
    req.user = admin;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'INVALID_SUPERADMIN_TOKEN',
      message: 'Superadmin session has expired or is invalid. Please log in again.',
    });
  }
}
