import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  isGoogleDriveConfigured,
  getOAuth2Client,
  getGoogleRedirectUri,
  getRegisteredRedirectUriHint,
  GOOGLE_DRIVE_SCOPES,
} from '../config/google.js';
import { encrypt } from '../utils/encryption.js';
import { Photographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { revokeDriveAccess } from '../services/drive.service.js';
import { createSignedState, verifySignedState } from '../utils/oauthState.js';

const OAUTH_STATE_COOKIE = 'wedding_oauth_state';
const OAUTH_PKCE_COOKIE = 'wedding_oauth_pkce';

function isSecureCookie(): boolean {
  return env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

/**
 * Builds the post-OAuth redirect target on the frontend.
 *
 * When CLIENT_URL is explicitly configured the absolute URL is used. In
 * production without CLIENT_URL the redirect stays RELATIVE, so the
 * photographer is returned to whichever Vercel domain served the request
 * instead of being bounced to localhost.
 */
function getPostAuthRedirect(path: string): string {
  if (!env.CLIENT_URL_EXPLICIT) {
    return path;
  }

  const clientUrl = (env.CLIENT_URL || '').trim();
  if (!clientUrl) return path;

  try {
    const base = clientUrl.replace(/\/+$/, '');
    return `${base}${path}`;
  } catch {
    return path;
  }
}

export async function getDriveStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const configured = isGoogleDriveConfigured();
  const connected = Boolean(req.user?.googleDrive?.connected);
  const googleEmail = req.user?.googleDrive?.googleEmail;
  const connectedAt = req.user?.googleDrive?.connectedAt;
  const reconnectRequired = Boolean(req.user?.googleDrive?.reconnectRequired);

  res.status(200).json({
    success: true,
    data: {
      configured,
      connected,
      googleEmail,
      connectedAt,
      reconnectRequired,
      // Only surfaced to help administrators register the exact matching URI.
      // Contains no secret material.
      redirectUri: getRegisteredRedirectUriHint(),
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

    // Cryptographically signed state bound to the authenticated photographer.
    const stateToken = createSignedState(req.user!._id.toString());

    // PKCE: a per-request code verifier is generated and its challenge is
    // sent to Google. The verifier itself stays server-side in an httpOnly
    // cookie and is required to redeem the authorization code, which protects
    // the callback against authorization-code interception.
    const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync();

    const isProduction = isSecureCookie();

    // Store state in httpOnly cookie with 10-minute expiry
    res.cookie(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    // The code verifier is stored separately from the state so it never
    // appears in a redirect URL or in any server access log.
    res.cookie(OAUTH_PKCE_COOKIE, codeVerifier, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      // Ensures a refresh token is always issued, even if the user had
      // previously authorized this app.
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_DRIVE_SCOPES,
      state: stateToken,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
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
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      // Never log the raw error payload — it can contain provider internals.
      console.error('[Google Drive OAuth] Authorization was not granted by the user.');
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=access_denied'));
      return;
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=missing_params'));
      return;
    }

    // Double-submit check: the state must match the cookie set at initiation.
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    if (!cookieState || cookieState !== state) {
      console.warn('[Google Drive OAuth] State mismatch. Potential CSRF or expired cookie.');
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=invalid_state'));
      return;
    }

    // Clear state cookie
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: 'lax',
      path: '/',
    });

    // Retrieve the PKCE code verifier stored at initiation.
    const codeVerifier = req.cookies?.[OAUTH_PKCE_COOKIE];
    res.clearCookie(OAUTH_PKCE_COOKIE, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: 'lax',
      path: '/',
    });

    if (!codeVerifier) {
      console.warn('[Google Drive OAuth] Missing PKCE code verifier. The flow may have expired.');
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=invalid_state'));
      return;
    }

    // Verify the signature, purpose and expiry of the state token.
    let stateData: { uid: string };
    try {
      stateData = verifySignedState(state);
    } catch (stateErr: any) {
      console.warn('[Google Drive OAuth] State verification failed:', stateErr?.message);
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=invalid_state'));
      return;
    }

    // Resolve the photographer bound to this flow BEFORE exchanging the
    // authorization code. This prevents a code from being redeemed against an
    // account that no longer exists or is no longer eligible.
    const photographer = await Photographer.findById(stateData.uid);
    if (!photographer) {
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=user_not_found'));
      return;
    }

    // A suspended studio must not be able to (re)link a Drive account.
    if (photographer.status === 'SUSPENDED') {
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=account_suspended'));
      return;
    }

    let tokens: any;
    try {
      const oauth2Client = getOAuth2Client();
      const tokenResponse = await oauth2Client.getToken({
        code,
        codeVerifier,
      });
      tokens = tokenResponse.tokens;
    } catch {
      console.error('[Google Drive OAuth] Token exchange failed.');
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=token_exchange_failed'));
      return;
    }

    if (!tokens?.refresh_token && !tokens?.access_token) {
      res.redirect(getPostAuthRedirect('/dashboard?drive_error=no_tokens'));
      return;
    }

    // Resolve the linked Google account email (read-only, display purpose).
    let googleEmail: string | undefined;
    try {
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      googleEmail = userInfo.data.email || undefined;
    } catch {
      // Not fatal: the Drive grant is still usable without the email.
      console.warn('[Google Drive OAuth] Could not read the Google account email.');
    }

    // Encrypt the refresh token before it is persisted.
    const refreshTokenEncrypted = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : photographer.googleDrive?.refreshTokenEncrypted;

    await Photographer.updateOne(
      { _id: photographer._id },
      {
        $set: {
          'googleDrive.connected': true,
          'googleDrive.reconnectRequired': false,
          'googleDrive.connectedAt': new Date(),
          ...(googleEmail ? { 'googleDrive.googleEmail': googleEmail } : {}),
          ...(refreshTokenEncrypted
            ? { 'googleDrive.refreshTokenEncrypted': refreshTokenEncrypted }
            : {}),
        },
      }
    );

    res.redirect(getPostAuthRedirect('/dashboard?drive=connected'));
  } catch (error: any) {
    // Log only a generic message — never the error payload, which can contain
    // the authorization code or client secret.
    console.error('[Google Drive OAuth] Callback processing error.');
    res.redirect(getPostAuthRedirect('/dashboard?drive_error=token_exchange_failed'));
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
      message:
        'Google Drive disconnected and access revoked. Existing folders remain in your Drive.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verifies the stored Drive connection is still usable by performing a cheap,
 * read-only API call. Used by the dashboard "verify connection" action.
 */
export async function verifyDriveConnection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const photographer = req.user!;

    if (!photographer.googleDrive?.connected) {
      res.status(400).json({
        success: false,
        error: 'DRIVE_NOT_CONNECTED',
        message: 'Google Drive is not connected to your studio account.',
      });
      return;
    }

    const { getDriveClientForPhotographer } = await import('../services/drive.service.js');
    const { drive } = await getDriveClientForPhotographer(photographer);

    await drive.files.list({
      q: `appProperties has { key='weddingAiPhotoFinder' and value='root' } and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
    });

    await Photographer.updateOne(
      { _id: photographer._id },
      { $set: { 'googleDrive.reconnectRequired': false } }
    );

    res.status(200).json({
      success: true,
      message: 'Google Drive connection verified.',
      data: { connected: true },
    });
  } catch (error: any) {
    const { classifyDriveError } = await import('../services/drive.service.js');
    const driveError = classifyDriveError(error);

    if (driveError.code === 'DRIVE_RECONNECT_REQUIRED') {
      const { flagReconnectRequired } = await import('../services/drive.service.js');
      await flagReconnectRequired(req.user!._id);
    }

    res.status(driveError.status).json({
      success: false,
      error: driveError.code,
      message: driveError.message,
    });
  }
}
