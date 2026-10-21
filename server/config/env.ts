import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.preprocess((val) => {
    // If DEFAULT_APP_PORT is provided, use it (typically 3000)
    if (process.env.DEFAULT_APP_PORT) {
      return Number(process.env.DEFAULT_APP_PORT);
    }
    // When PORT is 8080 (reserved for nginx/ingress), app must bind to internal 3000
    if (val === '8080' || val === 8080) {
      return 3000;
    }
    return val || 3000;
  }, z.coerce.number().default(3000)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().optional().default(''),
  JWT_SECRET: z.string().min(8).default('dev-wedding-ai-jwt-secret-key-32-chars-long'),
  COOKIE_NAME: z.string().default('wedding_auth_token'),
  SUPERADMIN_COOKIE_NAME: z.string().default('penta_superadmin_token'),
  SUPERADMIN_EMAIL: z.preprocess((val) => {
    // Override legacy default from container environment
    if (!val || typeof val !== 'string' || val.trim().toLowerCase() === 'admin@pentaprizm.com') {
      return 'pentaprizmofficial@gmail.com';
    }
    return val.trim().toLowerCase();
  }, z.string().email().default('pentaprizmofficial@gmail.com')),
  SUPERADMIN_DEFAULT_PASSWORD: z.preprocess((val) => {
    const raw = process.env.SUPERADMIN_PASSWORD || val;
    if (typeof raw === 'string') {
      const cleaned = raw.trim().replace(/^["']|["']$/g, '');
      if (cleaned.length >= 8) return cleaned;
    }
    return 'PentaPrizm2026!';
  }, z.string().min(8)).default('PentaPrizm2026!'),
  SUPERADMIN_RESET_PASSWORD: z.preprocess((val) => {
    return val === true || val === 'true' || process.env.RESET_SUPERADMIN === 'true';
  }, z.boolean()).default(false),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3000/api/integrations/google-drive/callback'),
  OAUTH_STATE_SECRET: z.string().default('dev-wedding-oauth-state-secret-2026'),
  TOKEN_ENCRYPTION_KEY: z.string().default('dev-encryption-key-wedding-drive-32-chars'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
