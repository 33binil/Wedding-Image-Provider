import { Router } from 'express';
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from '../controllers/event.controller.js';
import {
  requireAuth,
  requireActivePhotographer,
  requireActiveSubscriptionOrTrial,
} from '../middleware/auth.middleware.js';

const router = Router();

// All event routes require valid authentication and an un-suspended account
router.use(requireAuth);
router.use(requireActivePhotographer);

// Read routes: allowed for active and expired trial photographers (view-only)
router.get('/', listEvents);
router.get('/:id', getEventById);

// State-changing routes: blocked if trial has expired
router.post('/', requireActiveSubscriptionOrTrial, createEvent);
router.patch('/:id', requireActiveSubscriptionOrTrial, updateEvent);
router.delete('/:id', requireActiveSubscriptionOrTrial, deleteEvent);

export default router;
