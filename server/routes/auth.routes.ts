import { Router } from 'express';
import {
  googleSignIn,
  logout,
  getMe,
  getFirebaseConfig,
  getOnboardingState,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public Firebase Web App configuration (public identifiers only).
router.get('/firebase-config', getFirebaseConfig);

// Google Sign-In: the client sends the Firebase ID token, the server verifies
// it with the Firebase Admin SDK and issues the session cookie.
router.post('/google', authLimiter, googleSignIn);

// Onboarding state (photographer session required).
router.get('/onboarding', requireAuth, getOnboardingState);

router.post('/logout', logout);
router.get('/me', requireAuth, getMe);

export default router;
