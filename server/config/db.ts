import mongoose from 'mongoose';
import { env } from './env.js';

let mongodInstance: any = null;

export async function connectDB(): Promise<void> {
  // If already connected, reuse existing connection (critical for serverless environments like Vercel)
  if (mongoose.connection.readyState === 1) {
    return;
  }

  try {
    let mongoUri = env.MONGODB_URI || process.env.MONGODB_URI || '';
    const isProductionOrVercel = env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    if (!mongoUri) {
      if (isProductionOrVercel) {
        throw new Error(
          'FATAL: MONGODB_URI environment variable is required for production and Vercel deployments. In-memory database fallback is strictly disabled.'
        );
      }
      console.log('ℹ️ MONGODB_URI not provided. Initializing embedded MongoDB engine for local development...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create();
      mongoUri = mongodInstance.getUri();
      console.log('✅ Embedded MongoDB started at:', mongoUri);
    } else {
      console.log('Connecting to persistent MongoDB Atlas cluster...');
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri, {
      dbName: 'wedding_ai_photo_finder',
      serverSelectionTimeoutMS: 10000,
    });

    console.log('✨ MongoDB Connected Successfully:', mongoose.connection.host);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);

    const isProductionOrVercel = env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    if (isProductionOrVercel) {
      console.error('Production database connection failed. Halting process to preserve data persistence.');
      throw error;
    }

    // In local development, fallback to embedded Mongo only if persistent Atlas was unreachable and no memory server exists
    if (!mongodInstance) {
      console.log('Falling back to local development MongoDB...');
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongodInstance = await MongoMemoryServer.create();
        const fallbackUri = mongodInstance.getUri();
        await mongoose.connect(fallbackUri, {
          dbName: 'wedding_ai_photo_finder',
        });
        console.log('✅ Fallback MongoDB started successfully at:', fallbackUri);
        return;
      } catch (fallbackErr) {
        console.error('Failed to start fallback MongoDB:', fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
}
