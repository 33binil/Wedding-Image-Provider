import { Router } from 'express';
import {
  initiateConnect,
  handleCallback,
  disconnectDrive,
  getDriveStatus,
  verifyDriveConnection,
} from '../controllers/drive.controller.js';
import { requireAuth, requireActivePhotographer } from '../middleware/auth.middleware.js';

const router = Router();

// Connection status (photographer session required)
router.get('/status', requireAuth, getDriveStatus);

// Start the OAuth flow (photographer session required)
router.get('/connect', requireAuth, requireActivePhotographer, initiateConnect);

// Google redirects here. The signed state + httpOnly cookie provide the
// CSRF/binding guarantee, so no session middleware is required on this route.
router.get('/callback', handleCallback);

// Verify the stored connection is still usable
router.post('/verify', requireAuth, requireActivePhotographer, verifyDriveConnection);

// Disconnect and revoke
router.delete('/disconnect', requireAuth, disconnectDrive);

export default router;
