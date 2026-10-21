import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import publicRoutes from './routes/public.routes.js';
import driveRoutes from './routes/drive.routes.js';
import superadminRoutes from './routes/superadmin.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { generalLimiter } from './middleware/rateLimiter.js';

export function createApp(): Express {
  const app = express();

  // Trust first proxy (Cloud Run / AI Studio preview environment)
  app.set('trust proxy', 1);

  // Basic security headers configured for AI Studio iframe preview
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      xFrameOptions: false,
    })
  );

  // CORS configuration for cookies
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Cookie parsing
  app.use(cookieParser());

  // Body parsing
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // General rate limiting on /api
  app.use('/api', generalLimiter);

  // API Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      app: 'Wedding AI Photo Finder',
      stage: 1,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API modules
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/integrations/google-drive', driveRoutes);
  app.use('/api/superadmin', superadminRoutes);

  return app;
}
