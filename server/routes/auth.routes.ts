import { Router } from 'express';
import { register, login, verifyLoginOtp, logout, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/verify-login-otp', authLimiter, verifyLoginOtp);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);

export default router;
