import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/app.js';
import { connectDB } from '../server/config/db.js';
import { bootstrapSuperAdmin } from '../server/utils/bootstrapSuperadmin.js';

let isReady = false;
let initPromise: Promise<void> | null = null;

async function ensureConnected(): Promise<void> {
  if (isReady) return;
  if (!initPromise) {
    initPromise = (async () => {
      await connectDB();
      await bootstrapSuperAdmin();
      isReady = true;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureConnected();
  } catch (err: any) {
    console.error('[Vercel Serverless] Database connection error:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: 'DATABASE_UNAVAILABLE',
        message: 'Database connection failed. Please ensure MONGODB_URI is configured in Vercel environment variables.',
      })
    );
    return;
  }

  // Ensure req.url has /api prefix for Express router mounting
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  return app(req, res);
}
