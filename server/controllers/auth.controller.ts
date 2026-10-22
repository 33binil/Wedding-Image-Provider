import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Photographer } from '../models/Photographer.js';
import { signPhotographerSession } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { evaluatePhotographerAccess } from '../services/accessControl.service.js';
import { logAdminAction } from '../utils/auditLogger.js';
import {
  getFirebaseProjectId,
  isFirebaseConfigured,
} from '../config/firebase.js';
import {
  FirebaseAuthError,
  resolvePhotographerForIdentity,
  verifyGoogleIdentity,
} from '../services/firebaseAuth.service.js';

const googleSignInSchema = z.object({
  // The shape is validated here; the "missing token" case is reported by the
  // verifier so the client receives a single, consistent error code.
  idToken: z.string().optional(),
});

function setAuthCookie(res: Response, token: string): void {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Reports whether the BACKEND can verify Firebase ID tokens.
 *
 * The browser reads its own Firebase configuration from `VITE_FIREBASE_*`
 * environment variables, so this endpoint does NOT distribute configuration.
 * It exists so the frontend can:
 *   - detect that the backend has no service account configured, and
 *   - detect a frontend/backend Firebase PROJECT mismatch (a very common
 *     cause of "invalid ID token" errors).
 *
 * No service-account material is ever exposed.
 */
export async function getFirebaseConfig(
  _req: Request,
  res: Response
): Promise<void> {
  res.status(200).json({
    success: true,
    data: {
      configured: isFirebaseConfigured(),
      projectId: getFirebaseProjectId(),
    },
  });
}

/**
 * Signs a photographer in with a Firebase ID token obtained from Google
 * Sign-In.
 *
 * The token is verified server-side with the Firebase Admin SDK. The email,
 * UID and role are NEVER read from the request body — they all come from the
 * verified token or the stored MongoDB record.
 */
export async function googleSignIn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = googleSignInSchema.parse(req.body);

    const identity = await verifyGoogleIdentity(validated.idToken ?? '');

    const { photographer, created } = await resolvePhotographerForIdentity(identity);

    // A suspended studio must not be able to sign in.
    if (photographer.status === 'SUSPENDED') {
      await logAdminAction({
        action: 'PHOTOGRAPHER_SIGNIN_BLOCKED',
        targetType: 'PHOTOGRAPHER',
        targetId: photographer._id.toString(),
        ipAddress: req.ip,
        metadata: {
          email: photographer.email,
          reason: 'ACCOUNT_SUSPENDED',
        },
      });

      res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message:
          'Your photographer studio account has been suspended by Penta Prizm administrators. Please contact support.',
      });
      return;
    }

    // Issue the photographer session cookie.
    const sessionToken = signPhotographerSession({
      id: photographer._id.toString(),
      email: photographer.email,
    });

    setAuthCookie(res, sessionToken);

    const access = evaluatePhotographerAccess(photographer);

    await logAdminAction({
      action: 'PHOTOGRAPHER_GOOGLE_SIGNIN',
      targetType: 'PHOTOGRAPHER',
      targetId: photographer._id.toString(),
      ipAddress: req.ip,
      metadata: {
        email: photographer.email,
        studioName: photographer.name,
        firstTime: created,
      },
    });

    res.status(200).json({
      success: true,
      message: created
        ? 'Welcome to Penta Prizm! Let us connect your Google Drive.'
        : 'Welcome back!',
      data: {
        user: photographer.toJSON(),
        access,
        token: sessionToken,
        // Drives the onboarding flow: a brand-new photographer is prompted to
        // authorise Google Drive straight away.
        needsDriveSetup: !photographer.googleDrive?.connected,
        firstSignIn: created,
      },
    });
  } catch (error: any) {
    if (error instanceof FirebaseAuthError) {
      res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function logout(
  _req: Request,
  res: Response
): Promise<void> {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

export async function getMe(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const user = req.user!;
  const access = evaluatePhotographerAccess(user);

  res.status(200).json({
    success: true,
    data: {
      user: user.toJSON(),
      access,
      needsDriveSetup: !user.googleDrive?.connected,
    },
  });
}

/**
 * Exposes whether the current photographer has completed Google Drive
 * onboarding. Used by the frontend to decide whether to prompt for the Drive
 * consent screen.
 */
export async function getOnboardingState(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const user = req.user!;

  res.status(200).json({
    success: true,
    data: {
      driveConnected: Boolean(user.googleDrive?.connected),
      driveReconnectRequired: Boolean(user.googleDrive?.reconnectRequired),
      needsDriveSetup: !user.googleDrive?.connected,
    },
  });
}

export { Photographer };
