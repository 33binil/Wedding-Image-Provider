import { Router } from 'express';
import { getPublicEvent } from '../controllers/public.controller.js';

const router = Router();

router.get('/events/:token', getPublicEvent);

export default router;
