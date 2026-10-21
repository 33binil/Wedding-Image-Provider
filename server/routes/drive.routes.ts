import { Router } from 'express';
import {
  initiateConnect,
  handleCallback,
  disconnectDrive,
  getDriveStatus,
} from '../controllers/drive.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/status', requireAuth, getDriveStatus);
router.get('/connect', requireAuth, initiateConnect);
router.get('/callback', handleCallback);
router.delete('/disconnect', requireAuth, disconnectDrive);

export default router;
