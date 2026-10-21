import crypto from 'crypto';
import { env } from '../config/env.js';

// Derive 32-byte key using sha256 to ensure exact 32-byte key size regardless of key string format
const KEY = crypto.createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(cipherPackage: string): string {
  const parts = cipherPackage.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid cipher format');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
