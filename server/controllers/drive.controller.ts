import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { google } from 'googleapis';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  isGoogleDriveConfigured,
  getOAuth2Client,
  GOOGLE_DRIVE_SCOPES,
} from '../config/google.js';
import { encrypt } from '../utils/encryption.js';
import { Photographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { revokeDriveAccess } from '../services/drive.service.js';

const OAUTH_STATE_COOKIE = 'wedding_oauth_state';

export async function getDriveStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const configured = isGoogleDriveConfigured();
  const connected = Boolean(req.user?.googleDrive?.connected);
  const googleEmail = req.user?.googleDrive?.googleEmail;
  const connectedAt = req.user?.googleDrive?.connectedAt;
  const reconnectRequired = Boolean(req.user?.googleDrive?.reconnectRequired);
  const rootFolderId = req.user?.googleDrive?.rootFolderId;

  res.status(200).json({
    success: true,
    data: {
      configured,
      connected,
      googleEmail,
      connectedAt,
      reconnectRequired,
      rootFolderId,
    },
  });
}

export async function initiateConnect(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isGoogleDriveConfigured()) {
      res.status(503).json({
        success: false,
        configured: false,
        error: 'GOOGLE_DRIVE_NOT_CONFIGURED',
        message:
          'Google Drive OAuth is not yet configured on this server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      });
      return;
    }

    const oauth2Client = getOAuth2Client();

    // Generate random cryptographic state token containing photographer ID and timestamp
    const randomNonce = crypto.randomBytes(24).toString('hex');
    const statePayload = JSON.stringify({
      userId: req.user!._id.toString(),
      nonce: randomNonce,
      createdAt: Date.now(),
    });

    const stateToken = Buffer.from(statePayload).toString('base64url');
    const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    // Store state in httpOnly cookie with 10-minute expiry
    res.cookie(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_DRIVE_SCOPES,
      state: stateToken,
    });

    // If client requested JSON (e.g. from axios), return the URL; otherwise redirect
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      res.status(200).json({
        success: true,
        data: {
          authUrl,
        },
      });
      return;
    }

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
}

export async function handleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('[Google Drive OAuth] Callback returned error:', oauthError);
      res.redirect('/dashboard?drive_error=access_denied');
      return;
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      res.redirect('/dashboard?drive_error=missing_params');
      return;
    }

    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    if (!cookieState || cookieState !== state) {
      console.warn('[Google Drive OAuth] State mismatch. Potential CSRF or expired cookie.');
      res.redirect('/dashboard?drive_error=invalid_state');
      return;
    }

    // Clear state cookie
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });

    // Decode state
    let stateData: { userId: string; createdAt: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      if (Date.now() - stateData.createdAt > 10 * 60 * 1000) {
        throw new Error('State expired');
      }
    } catch {
      res.redirect('/dashboard?drive_error=expired_state');
      return;
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token && !tokens.access_token) {
      res.redirect('/dashboard?drive_error=no_tokens');
      return;
    }

    // Set credentials on client to fetch user profile email
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || undefined;

    const photographer = await Photographer.findById(stateData.userId);
    if (!photographer) {
      res.redirect('/dashboard?drive_error=user_not_found');
      return;
    }

    // Encrypt refresh token before storing
    const refreshTokenEncrypted = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : photographer.googleDrive.refreshTokenEncrypted;

    photographer.googleDrive = {
      connected: true,
      googleEmail,
      refreshTokenEncrypted,
      connectedAt: new Date(),
      rootFolderId: photographer.googleDrive.rootFolderId,
      reconnectRequired: false,
    };

    await photographer.save();

    res.redirect('/dashboard?drive=connected');
  } catch (error) {
    console.error('[Google Drive OAuth] Callback processing error:', error);
    res.redirect('/dashboard?drive_error=token_exchange_failed');
  }
}

export async function disconnectDrive(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const photographer = req.user!;
    await revokeDriveAccess(photographer);

    res.status(200).json({
      success: true,
      message: 'Google Drive disconnected and revoked successfully',
    });
  } catch (error) {
    next(error);
  }
}
