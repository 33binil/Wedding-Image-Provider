import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Photographer } from '../models/Photographer.js';
import { Invitation } from '../models/Invitation.js';
import { signToken, signPreAuthToken, verifyPreAuthToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { evaluatePhotographerAccess } from '../services/accessControl.service.js';
import { logAdminAction } from '../utils/auditLogger.js';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const verifyOtpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits'),
  preAuthToken: z.string().optional(),
});

function setAuthCookie(res: Response, token: string): void {
  const isProduction = env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'lax' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Public registration without invitation or OTP.
 * Creates an account with PENDING verification status.
 * Does NOT issue an authenticated photographer session immediately.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = registerSchema.parse(req.body);
    const normalizedEmail = validatedData.email;

    // Disallow photographer registration using the designated superadmin identity
    if (normalizedEmail === env.SUPERADMIN_EMAIL.toLowerCase().trim()) {
      res.status(400).json({
        success: false,
        error: 'RESERVED_EMAIL',
        message: 'This email address is reserved for platform administration and cannot be registered as a photographer.',
      });
      return;
    }

    // 1. Check if an account already exists
    const existingUser = await Photographer.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address is already registered.',
      });
      return;
    }

    // 2. Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    const trialStartAt = new Date();
    // Default 30-day trial for self-registered photographers
    const trialExpiresAt = new Date(trialStartAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 3. Create photographer with PENDING verification status
    const photographer = await Photographer.create({
      name: validatedData.name,
      email: normalizedEmail,
      passwordHash,
      role: 'PHOTOGRAPHER',
      status: 'PENDING',
      trialStartAt,
      trialExpiresAt,
      googleDrive: {
        connected: false,
      },
    });

    // If an existing invitation record existed for this email, link and mark accepted
    try {
      await Invitation.updateMany(
        { email: normalizedEmail, status: 'PENDING' },
        { $set: { status: 'ACCEPTED', usedAt: new Date() } }
      );
    } catch {
      // Non-critical, ignore
    }

    // 4. Log audit record
    await logAdminAction({
      action: 'PHOTOGRAPHER_REGISTERED',
      targetType: 'PHOTOGRAPHER',
      targetId: photographer._id.toString(),
      ipAddress: req.ip,
      metadata: {
        studioName: photographer.name,
        email: photographer.email,
        trialExpiresAt,
        status: 'PENDING',
      },
    });

    // Do NOT issue an authenticated cookie here. Return success and instruct user to login with OTP.
    res.status(201).json({
      success: true,
      message: 'Studio registered successfully with pending status. Please sign in with your email and password, then enter your 6-digit login OTP.',
      data: {
        user: photographer.toJSON(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Step 1: Validate email & password credentials.
 * Issues a short-lived, restricted pre-authentication session token.
 * Does NOT issue a full photographer session cookie.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = loginSchema.parse(req.body);
    const normalizedEmail = validatedData.email;

    const photographer = await Photographer.findOne({ email: normalizedEmail });
    if (!photographer || photographer.role === 'SUPERADMIN') {
      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email address or password.',
      });
      return;
    }

    const isMatch = await bcrypt.compare(validatedData.password, photographer.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email address or password.',
      });
      return;
    }

    // Check account status
    if (photographer.status === 'SUSPENDED') {
      res.status(401).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your photographer studio account has been suspended by Penta Prizm administrators. Please contact support.',
      });
      return;
    }

    // Issue short-lived, restricted pre-authentication session token (10 minutes)
    const preAuthToken = signPreAuthToken({
      id: photographer._id.toString(),
      email: photographer.email,
    });

    res.status(200).json({
      success: true,
      message: 'Credentials verified. Please enter the 6-digit login verification OTP provided by your Super Admin.',
      data: {
        preAuthToken,
        email: photographer.email,
        requiresOtp: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Step 2: Verify the 6-digit login OTP against the pre-auth session.
 * Issues the full photographer session cookie on success.
 */
export async function verifyLoginOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = verifyOtpSchema.parse(req.body);

    let token = validatedData.preAuthToken;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'PRE_AUTH_REQUIRED',
        message: 'Pre-authentication session token required. Please log in with your email and password first.',
      });
      return;
    }

    let payload: { id: string; email: string };
    try {
      payload = verifyPreAuthToken(token);
    } catch {
      res.status(401).json({
        success: false,
        error: 'PRE_AUTH_EXPIRED',
        message: 'Your verification session has expired. Please sign in with your email and password again.',
      });
      return;
    }

    const photographer = await Photographer.findById(payload.id);
    if (!photographer || photographer.email.toLowerCase() !== payload.email.toLowerCase()) {
      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid administrative session credentials.',
      });
      return;
    }

    if (photographer.status === 'SUSPENDED') {
      res.status(401).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your photographer studio account has been suspended by Penta Prizm administrators. Please contact support.',
      });
      return;
    }

    const otpData = photographer.loginOtp;

    // Check if an OTP was ever generated
    if (!otpData || !otpData.codeHash) {
      res.status(400).json({
        success: false,
        error: 'OTP_NOT_GENERATED',
        message: 'No login verification OTP has been generated for your account. Please ask your Penta Prizm Super Admin to generate your 6-digit login OTP.',
      });
      return;
    }

    // Check if already used
    if (otpData.isUsed) {
      res.status(400).json({
        success: false,
        error: 'OTP_ALREADY_USED',
        message: 'This login OTP has already been used. Please ask your Super Admin to generate a fresh 6-digit OTP.',
      });
      return;
    }

    // Check expiry
    if (otpData.expiresAt && new Date() > new Date(otpData.expiresAt)) {
      res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'This login OTP has expired. Please ask your Super Admin to generate a fresh 6-digit OTP.',
      });
      return;
    }

    // Check failed attempts limit
    if ((otpData.failedAttempts || 0) >= 5) {
      res.status(400).json({
        success: false,
        error: 'OTP_LOCKED',
        message: 'Too many failed verification attempts. This login OTP has been locked for security. Please request a new OTP from your Super Admin.',
      });
      return;
    }

    // Verify 6-digit OTP against stored bcrypt hash
    const isCodeMatch = await bcrypt.compare(validatedData.otp, otpData.codeHash);
    if (!isCodeMatch) {
      photographer.loginOtp!.failedAttempts = (photographer.loginOtp!.failedAttempts || 0) + 1;
      const remainingAttempts = Math.max(0, 5 - photographer.loginOtp!.failedAttempts);
      await photographer.save();

      res.status(400).json({
        success: false,
        error: 'INVALID_OTP',
        message: `Invalid 6-digit verification code. ${remainingAttempts} attempt(s) remaining before OTP is locked.`,
      });
      return;
    }

    // Atomic update to mark OTP as used and activate pending account (prevents concurrent replay)
    const updatedPhotographer = await Photographer.findOneAndUpdate(
      {
        _id: photographer._id,
        'loginOtp.isUsed': false,
        'loginOtp.expiresAt': { $gt: new Date() },
        'loginOtp.failedAttempts': { $lt: 5 },
      },
      {
        $set: {
          'loginOtp.isUsed': true,
          'loginOtp.usedAt': new Date(),
          status: photographer.status === 'PENDING' ? 'ACTIVE' : photographer.status,
        },
      },
      { new: true }
    );

    if (!updatedPhotographer) {
      res.status(400).json({
        success: false,
        error: 'OTP_REPLAY_DETECTED',
        message: 'This login OTP could not be verified or was concurrently consumed. Please request a fresh code.',
      });
      return;
    }

    // Log successful OTP verification in audit ledger
    await logAdminAction({
      adminId: updatedPhotographer.loginOtp?.generatedBy,
      action: 'PHOTOGRAPHER_LOGIN_OTP_VERIFIED',
      targetType: 'PHOTOGRAPHER',
      targetId: updatedPhotographer._id.toString(),
      ipAddress: req.ip,
      metadata: {
        email: updatedPhotographer.email,
        studioName: updatedPhotographer.name,
        verifiedAt: new Date(),
      },
    });

    // Issue genuine photographer session token
    const sessionToken = signToken({
      id: updatedPhotographer._id.toString(),
      email: updatedPhotographer.email,
    });

    setAuthCookie(res, sessionToken);

    const access = evaluatePhotographerAccess(updatedPhotographer);

    res.status(200).json({
      success: true,
      message: 'Login verified successfully. Welcome to your studio portal!',
      data: {
        user: updatedPhotographer.toJSON(),
        access,
        token: sessionToken,
      },
    });
  } catch (error) {
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
    sameSite: isProduction ? 'lax' : 'lax',
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
    },
  });
}
