import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app.js';
import { connectDB } from './server/config/db.js';
import { env } from './server/config/env.js';
import {
  getFirebaseProjectId,
  isFirebaseConfigured,
} from './server/config/firebase.js';
import { bootstrapSuperAdmin } from './server/utils/bootstrapSuperadmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInitPromise: Promise<void> | null = null;

function initDatabase(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await connectDB();
      await bootstrapSuperAdmin();
    })().catch((err) => {
      console.error('Database Initialization Warning/Error:', err);
      throw err;
    });
  }
  return dbInitPromise;
}

async function startServer() {
  // Start database connection in background
  const dbPromise = initDatabase();

  // Middleware ensuring database is ready before processing API routes.
  // Registered inside createApp() so it runs BEFORE the API routers.
  const apiGate = async (req: any, res: any, next: any) => {
    if (req.path === '/health') {
      return next();
    }
    try {
      await dbPromise;
      next();
    } catch (err) {
      console.error('API request waiting on database error:', err);
      res.status(503).json({
        success: false,
        message: 'Database service is starting up or temporarily unavailable. Please try again shortly.',
      });
    }
  };

  const app = createApp({ apiGate });

  // Firebase Admin SDK readiness (safe to log — reports only whether the
  // service account is configured and the public project ID, never secrets).
  const firebaseConfigured = isFirebaseConfigured();
  const firebaseProjectId = getFirebaseProjectId();
  if (firebaseConfigured) {
    console.log(`[Firebase] Admin SDK initialized for project "${firebaseProjectId}".`);
  } else {
    console.warn(
      '[Firebase] Admin SDK NOT configured — Google sign-in will return 503. ' +
        'Set FIREBASE_SERVICE_ACCOUNT (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) in .env.'
    );
  }

  if (env.NODE_ENV !== 'production') {
    // Development mode: mount Vite dev server middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // Production mode: serve built assets from dist
    const express = await import('express');
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.default.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // API error handlers are registered inside createApp() so the Vercel
  // serverless entry point shares the exact same behaviour.

  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
  const targetPort = cliPort || (process.env.DEFAULT_APP_PORT ? Number(process.env.DEFAULT_APP_PORT) : null) || (env.PORT !== 8080 ? env.PORT : 3000);

  const server = app.listen(targetPort, '0.0.0.0', () => {
    console.log(`✨ Penta Prizm · Wedding AI Photo Finder running on http://0.0.0.0:${targetPort} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log('Shutting down server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
