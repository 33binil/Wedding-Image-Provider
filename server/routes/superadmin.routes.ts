import { Router } from 'express';
import {
  superAdminLogin,
  superAdminLogout,
  getSuperAdminMe,
  getDashboardStats,
  createInvitation,
  listInvitations,
  revokeInvitation,
  listPhotographers,
  getPhotographerById,
  updatePhotographerStatus,
  updatePhotographerTrial,
  generatePhotographerLoginOtp,
  getAuditLogs,
} from '../controllers/superadmin.controller.js';
import { requireSuperAdmin } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public superadmin login
router.post('/auth/login', authLimiter, superAdminLogin);

// Protected Superadmin routes (Server-side role authorization)
router.use(requireSuperAdmin);

router.post('/auth/logout', superAdminLogout);
router.get('/auth/me', getSuperAdminMe);
router.get('/dashboard-stats', getDashboardStats);

// Invitations
router.post('/invitations', createInvitation);
router.get('/invitations', listInvitations);
router.post('/invitations/:id/revoke', revokeInvitation);

// Photographers
router.get('/photographers', listPhotographers);
router.get('/photographers/:id', getPhotographerById);
router.patch('/photographers/:id/status', updatePhotographerStatus);
router.patch('/photographers/:id/trial', updatePhotographerTrial);
router.post('/photographers/:id/login-otp', generatePhotographerLoginOtp);

// Audit logs
router.get('/audit-logs', getAuditLogs);

export default router;
