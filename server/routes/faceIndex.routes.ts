import { Router } from 'express';
import { requireAuth, requireActivePhotographer, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  startIndexing,
  getIndexingStatusHandler,
  resetIndexing,
} from '../controllers/faceIndex.controller.js';
import { getPublicIndexingStatus } from '../controllers/faceIndex.controller.js';

const router = Router();

router.post(
  '/events/:eventId/face-index',
  requireAuth,
  requireActivePhotographer,
  (req, res, next) => startIndexing(req as AuthenticatedRequest, res, next)
);

router.get(
  '/events/:eventId/face-index/status',
  requireAuth,
  requireActivePhotographer,
  (req, res, next) => getIndexingStatusHandler(req as AuthenticatedRequest, res, next)
);

router.delete(
  '/events/:eventId/face-index',
  requireAuth,
  requireActivePhotographer,
  (req, res, next) => resetIndexing(req as AuthenticatedRequest, res, next)
);

router.get('/public/events/:token/face-index/status', getPublicIndexingStatus);

export default router;
