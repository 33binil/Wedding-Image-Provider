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

/**
 * Resolves the path Express should route on.
 *
 * Vercel routes every `/api/*` request to this single function via the
 * `rewrites` rule in vercel.json. The incoming `req.url` normally already
 * carries the full original path (e.g.
 * `/api/integrations/google-drive/callback?code=...&state=...`), which is
 * what the Express router needs. If a proxy in front of the platform ever
 * collapses it to the rewrite destination (`/api`), the original path is
 * recovered from the platform's original-URL headers.
 *
 * Losing the sub-path would break the Google OAuth callback route, so this
 * is handled defensively.
 */
function resolveRequestUrl(req: IncomingMessage): string {
  const headerValue = (name: string): string | undefined => {
    const raw = req.headers[name];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };

  const normalize = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  };

  const fromRequest = normalize(req.url || '/');
  if (fromRequest === '/api' || fromRequest.startsWith('/api/') || fromRequest.startsWith('/api?')) {
    return fromRequest;
  }

  const fromHeaders = [
    headerValue('x-vercel-original-url'),
    headerValue('x-forwarded-uri'),
    headerValue('x-original-url'),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .find((value) => value.startsWith('/api/') || value.startsWith('/api?'));

  if (fromHeaders) {
    return fromHeaders;
  }

  // Ensure the /api prefix expected by the Express router mount points.
  return `/api${fromRequest === '/' ? '' : fromRequest}`;
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
        message:
          'Database connection failed. Please ensure MONGODB_URI is configured in Vercel environment variables.',
      })
    );
    return;
  }

  req.url = resolveRequestUrl(req);

  return app(req, res);
}
