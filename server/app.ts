import express, { Express, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import publicRoutes from './routes/public.routes.js';
import driveRoutes from './routes/drive.routes.js';
import superadminRoutes from './routes/superadmin.routes.js';
import faceIndexRoutes from './routes/faceIndex.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { generalLimiter } from './middleware/rateLimiter.js';

export interface CreateAppOptions {
  /**
   * Middleware executed for every /api request BEFORE the routers.
   * Used by the local dev server to wait for the database connection to be
   * ready. It must be registered before the route handlers, otherwise it would
   * never run.
   */
  apiGate?: RequestHandler;
}

export function createApp(options: CreateAppOptions = {}): Express {
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

  // CORS configuration for cookies and custom auth headers
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, origin || true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-superadmin-token',
        'Accept',
        'X-Requested-With',
      ],
    })
  );

  // Cookie parsing
  app.use(cookieParser());

  // Body parsing
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // General rate limiting on /api
  app.use('/api', generalLimiter);

  // Database-readiness gate (local dev server). Registered before the routers
  // so API requests actually wait for the connection.
  if (options.apiGate) {
    app.use('/api', options.apiGate);
  }

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
  app.use('/api', faceIndexRoutes);

  // API error handlers.
  //
  // These live inside createApp() (rather than only in server.ts) so that the
  // Vercel serverless entry point — which only calls createApp() — also
  // returns structured JSON errors instead of Express' default HTML error
  // page. The not-found handler is scoped to /api so the SPA fallback still
  // works for frontend routes.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
