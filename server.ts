import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app.js';
import { connectDB } from './server/config/db.js';
import { env } from './server/config/env.js';
import { errorHandler, notFoundHandler } from './server/middleware/error.middleware.js';
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
      console.error('Fatal Database Initialization Error:', err);
      process.exit(1);
    });
  }
  return dbInitPromise;
}

async function startServer() {
  // Start database connection in background
  const dbPromise = initDatabase();

  const app = createApp();

  // Middleware ensuring database is ready before processing API routes
  app.use('/api', async (_req, _res, next) => {
    try {
      await dbPromise;
      next();
    } catch (err) {
      next(err);
    }
  });

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

  // API error handlers
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`✨ Penta Prizm · Wedding AI Photo Finder running on http://0.0.0.0:${env.PORT} [${env.NODE_ENV}]`);
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
