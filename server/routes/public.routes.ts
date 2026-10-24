import { Router } from 'express';
import { getPublicEvent, matchSelfieToEvent } from '../controllers/public.controller.js';

const router = Router();

router.get('/events/:token', getPublicEvent);
router.post('/events/:token/face-match', matchSelfieToEvent);

export default router;
