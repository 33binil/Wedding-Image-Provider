import {
  getFirebaseAuth,
  isFirebaseConfigured,
  isFirebaseMisconfigured,
} from '../config/firebase.js';
import { IPhotographer, Photographer } from '../models/Photographer.js';
import { Invitation } from '../models/Invitation.js';
import { logAdminAction } from '../utils/auditLogger.js';

export interface VerifiedFirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  provider?: string;
  signInProvider?: string;
}

export class FirebaseAuthError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Verifier seam. Production always uses the Firebase Admin SDK. Tests can
 * substitute a deterministic verifier so the account-linking logic can be
 * exercised without live Firebase credentials.
 */
export type IdTokenVerifier = (
  idToken: string
) => Promise<VerifiedFirebaseIdentity>;

const defaultVerifier: IdTokenVerifier = async (idToken: string) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new FirebaseAuthError(
      isFirebaseMisconfigured()
        ? 'FIREBASE_MISCONFIGURED'
        : 'FIREBASE_NOT_CONFIGURED',
      isFirebaseMisconfigured()
        ? 'Firebase Authentication is misconfigured on this server. Please contact Penta Prizm support.'
        : 'Firebase Authentication is not configured on this server.',
      503
    );
  }

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (err: any) {
    throw new FirebaseAuthError(
      'INVALID_ID_TOKEN',
      'The sign-in credential could not be verified. Please try signing in again.',
      401
    );
  }

  return {
    uid: decoded.uid,
    email: String(decoded.email || '').toLowerCase(),
    emailVerified: decoded.email === undefined ? false : decoded.email_verified === true,
    name: decoded.name,
    picture: decoded.picture,
    provider: decoded.firebase?.sign_in_provider,
    signInProvider: decoded.firebase?.sign_in_provider,
  };
};

let idTokenVerifier: IdTokenVerifier = defaultVerifier;

/**
 * Test seam: replaces the ID token verifier. Passing null restores the real
 * Firebase Admin SDK verifier.
 */
export function setIdTokenVerifier(verifier: IdTokenVerifier | null): void {
  idTokenVerifier = verifier || defaultVerifier;
}

/**
 * Verifies a Firebase ID token and enforces the Google provider + verified
 * email requirements. The email is only trusted because Google (via Firebase)
 * has verified ownership of it.
 */
export async function verifyGoogleIdentity(idToken: string): Promise<VerifiedFirebaseIdentity> {
  if (typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new FirebaseAuthError(
      'MISSING_ID_TOKEN',
      'A Firebase ID token is required to sign in.',
      400
    );
  }

  let identity: VerifiedFirebaseIdentity;
  try {
    identity = await idTokenVerifier(idToken.trim());
  } catch (err: any) {
    if (err instanceof FirebaseAuthError) {
      throw err;
    }
    // Never surface the raw verification error — it can contain token
    // material or internal Firebase details.
    throw new FirebaseAuthError(
      'INVALID_ID_TOKEN',
      'The sign-in credential could not be verified. Please try signing in again.',
      401
    );
  }

  if (!identity.uid) {
    throw new FirebaseAuthError('INVALID_ID_TOKEN', 'The sign-in credential is malformed.', 401);
  }

  const provider = identity.provider || identity.signInProvider;
  if (provider && provider !== 'google.com') {
    throw new FirebaseAuthError(
      'UNSUPPORTED_PROVIDER',
      'Only Google sign-in is supported for photographer accounts.',
      403
    );
  }

  if (!identity.email) {
    throw new FirebaseAuthError(
      'MISSING_EMAIL',
      'Your Google account does not expose an email address, so it cannot be used for a studio account.',
      403
    );
  }

  if (!identity.emailVerified) {
    throw new FirebaseAuthError(
      'UNVERIFIED_EMAIL',
      'Your Google account email address is not verified. Please verify it with Google and try again.',
      403
    );
  }

  return identity;
}

export interface LinkResult {
  photographer: IPhotographer;
  /** True when a brand-new photographer record was created by this sign-in. */
  created: boolean;
  /** True when an existing legacy record was linked to a Firebase UID. */
  linked: boolean;
}

const DEFAULT_TRIAL_DAYS = 30;

/**
 * Resolves the photographer record for a verified Google identity.
 *
 * Resolution order:
 *   1. An existing record already bound to this Firebase UID.
 *   2. An existing record with the same email that has NO Firebase UID yet —
 *      a legacy account. It is linked to this UID. This is safe because the
 *      email comes from a Google-verified Firebase token, so the person
 *      signing in demonstrably controls that mailbox.
 *   3. A new record is created.
 *
 * A record already bound to a DIFFERENT Firebase UID is never merged — the
 * sign-in is refused so two Google accounts cannot collide on one mailbox.
 */
export async function resolvePhotographerForIdentity(
  identity: VerifiedFirebaseIdentity
): Promise<LinkResult> {
  // 1. Direct hit on the Firebase UID.
  const byUid = await Photographer.findOne({ firebaseUid: identity.uid });
  if (byUid) {
    return { photographer: byUid, created: false, linked: false };
  }

  // 2. Legacy record with the same verified email.
  const byEmail = await Photographer.findOne({ email: identity.email });

  if (byEmail) {
    if (byEmail.firebaseUid && byEmail.firebaseUid !== identity.uid) {
      throw new FirebaseAuthError(
        'ACCOUNT_LINK_CONFLICT',
        'This Google account is already linked to a different studio account. Please contact Penta Prizm support.',
        409
      );
    }

    if (byEmail.role === 'SUPERADMIN') {
      // Never let a Google sign-in take over the platform superadmin account.
      throw new FirebaseAuthError(
        'RESERVED_ACCOUNT',
        'This email address is reserved for platform administration and cannot be used for a photographer studio account.',
        403
      );
    }

    if (!byEmail.firebaseUid) {
      // Atomic claim: the filter ensures only one concurrent sign-in can bind
      // this UID to the legacy account.
      const claimed = await Photographer.findOneAndUpdate(
        {
          _id: byEmail._id,
          $or: [{ firebaseUid: { $exists: false } }, { firebaseUid: null }, { firebaseUid: '' }],
        },
        {
          $set: {
            firebaseUid: identity.uid,
            firebaseLinkedAt: new Date(),
            ...(identity.name && !byEmail.name ? { name: identity.name } : {}),
          },
        },
        { new: true }
      );

      if (!claimed) {
        // Another request linked this account in the meantime — reload it.
        const reloaded = await Photographer.findById(byEmail._id);
        if (reloaded?.firebaseUid && reloaded.firebaseUid !== identity.uid) {
          throw new FirebaseAuthError(
            'ACCOUNT_LINK_CONFLICT',
            'This Google account is already linked to a different studio account. Please contact Penta Prizm support.',
            409
          );
        }
        return { photographer: reloaded!, created: false, linked: false };
      }

      await logAdminAction({
        action: 'PHOTOGRAPHER_FIREBASE_LINKED',
        targetType: 'PHOTOGRAPHER',
        targetId: byEmail._id.toString(),
        metadata: {
          email: byEmail.email,
          studioName: byEmail.name,
          linkedAt: new Date().toISOString(),
        },
      });

      return { photographer: claimed, created: false, linked: true };
    }

    return { photographer: byEmail, created: false, linked: false };
  }

  // 3. Brand-new photographer.
  const invitation = await Invitation.findOne({
    email: identity.email,
    status: 'PENDING',
  });

  const trialDays = invitation?.trialDays ?? DEFAULT_TRIAL_DAYS;
  const trialStartAt = new Date();
  const trialExpiresAt = invitation?.trialExpiresAt
    ? new Date(invitation.trialExpiresAt)
    : new Date(trialStartAt.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const created = await Photographer.create({
    name: identity.name || identity.email.split('@')[0] || 'New Studio',
    email: identity.email,
    firebaseUid: identity.uid,
    firebaseLinkedAt: new Date(),
    role: 'PHOTOGRAPHER',
    status: 'ACTIVE',
    trialStartAt,
    trialExpiresAt,
    googleDrive: {
      connected: false,
    },
  });

  // Consume a matching invitation, if one exists.
  if (invitation) {
    try {
      await Invitation.updateOne(
        { _id: invitation._id, status: 'PENDING' },
        { $set: { status: 'ACCEPTED', usedAt: new Date() } }
      );
    } catch {
      // Non-critical: the account is created either way.
    }
  }

  await logAdminAction({
    action: 'PHOTOGRAPHER_REGISTERED',
    targetType: 'PHOTOGRAPHER',
    targetId: created._id.toString(),
    metadata: {
      studioName: created.name,
      email: created.email,
      authProvider: 'firebase-google',
      trialExpiresAt,
      status: 'ACTIVE',
    },
  });

  return { photographer: created, created: true, linked: false };
}

export function isFirebaseAuthAvailable(): boolean {
  return isFirebaseConfigured();
}
