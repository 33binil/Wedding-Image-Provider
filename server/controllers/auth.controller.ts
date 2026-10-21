import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Photographer } from '../models/Photographer.js';
import { Invitation } from '../models/Invitation.js';
import { signToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { evaluatePhotographerAccess } from '../services/accessControl.service.js';
import { logAdminAction } from '../utils/auditLogger.js';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
    activationCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Activation code must be a 6-digit number'),
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

function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

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

    // 2. Validate Invitation from Penta Prizm
    const invitation = await Invitation.findOne({
      email: normalizedEmail,
      status: 'PENDING',
    });

    if (!invitation) {
      res.status(400).json({
        success: false,
        error: 'INVITATION_REQUIRED',
        message:
          'A valid Penta Prizm studio invitation is required to register. Please contact your platform administrator.',
      });
      return;
    }

    // Check expiry
    if (new Date() > new Date(invitation.expiresAt)) {
      invitation.status = 'EXPIRED';
      await invitation.save();
      res.status(400).json({
        success: false,
        error: 'INVITATION_EXPIRED',
        message:
          'This invitation code has expired. Please ask your administrator to send a fresh invitation.',
      });
      return;
    }

    // Check failed attempts limit
    if (invitation.failedAttempts >= 5) {
      invitation.status = 'REVOKED';
      await invitation.save();
      res.status(400).json({
        success: false,
        error: 'INVITATION_LOCKED',
        message:
          'Too many failed activation attempts for this invitation. It has been locked for security. Please request a new invitation.',
      });
      return;
    }

    // Verify 6-digit code against stored hash
    const isCodeMatch = await bcrypt.compare(validatedData.activationCode, invitation.codeHash);
    if (!isCodeMatch) {
      invitation.failedAttempts += 1;
      const remainingAttempts = Math.max(0, 5 - invitation.failedAttempts);

      if (remainingAttempts === 0) {
        invitation.status = 'REVOKED';
      }
      await invitation.save();

      res.status(400).json({
        success: false,
        error: 'INVALID_ACTIVATION_CODE',
        message: `Invalid activation code. ${remainingAttempts} attempt(s) remaining before invitation is revoked.`,
      });
      return;
    }

    // 3. Atomically create photographer and consume invitation
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    const trialStartAt = new Date();
    const trialExpiresAt =
      invitation.trialExpiresAt ||
      new Date(trialStartAt.getTime() + (invitation.trialDays || 30) * 24 * 60 * 60 * 1000);

    let photographer: any;

    // Use transaction if supported (replica set), otherwise safe sequential update
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const created = await Photographer.create(
            [
              {
                name: validatedData.name,
                email: normalizedEmail,
                passwordHash,
                role: 'PHOTOGRAPHER',
                status: 'ACTIVE',
                trialStartAt,
                trialExpiresAt,
                googleDrive: {
                  connected: false,
                },
              },
            ],
            { session }
          );
          photographer = created[0];

          invitation.status = 'ACCEPTED';
          invitation.usedAt = new Date();
          await invitation.save({ session });
        });
      } finally {
        await session.endSession();
      }
    } catch {
      // Fallback for standalone Mongo environments (e.g. single-node memory server without replica set)
      photographer = await Photographer.create({
        name: validatedData.name,
        email: normalizedEmail,
        passwordHash,
        role: 'PHOTOGRAPHER',
        status: 'ACTIVE',
        trialStartAt,
        trialExpiresAt,
        googleDrive: {
          connected: false,
        },
      });

      invitation.status = 'ACCEPTED';
      invitation.usedAt = new Date();
      await invitation.save();
    }

    // 4. Log audit record
    await logAdminAction({
      adminId: invitation.createdBy,
      action: 'PHOTOGRAPHER_REGISTERED',
      targetType: 'PHOTOGRAPHER',
      targetId: photographer._id.toString(),
      metadata: {
        studioName: invitation.studioName,
        email: photographer.email,
        trialDays: invitation.trialDays,
        trialExpiresAt,
      },
    });

    const token = signToken({
      id: photographer._id.toString(),
      email: photographer.email,
    });

    setAuthCookie(res, token);

    const access = evaluatePhotographerAccess(photographer);

    res.status(201).json({
      success: true,
      message: 'Photographer registration successful. Welcome to Penta Prizm!',
      data: {
        user: photographer.toJSON(),
        access,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = loginSchema.parse(req.body);

    const photographer = await Photographer.findOne({ email: validatedData.email });
    if (!photographer) {
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
      res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message:
          'Your photographer studio account has been suspended by Penta Prizm administrators. Please contact support.',
      });
      return;
    }

    const token = signToken({
      id: photographer._id.toString(),
      email: photographer.email,
    });

    setAuthCookie(res, token);

    const access = evaluatePhotographerAccess(photographer);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: photographer.toJSON(),
        access,
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
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
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
