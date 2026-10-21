import mongoose from 'mongoose';
import { env } from './env.js';

let mongodInstance: any = null;

export async function connectDB(): Promise<void> {
  try {
    let mongoUri = env.MONGODB_URI;

    if (!mongoUri) {
      if (env.NODE_ENV === 'production') {
        throw new Error(
          'FATAL: MONGODB_URI environment variable is required in production. Embedded in-memory MongoDB is strictly disabled in production.'
        );
      }
      console.log('ℹ️ MONGODB_URI not provided. Initializing embedded MongoDB engine for local development...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create();
      mongoUri = mongodInstance.getUri();
      console.log('✅ Embedded MongoDB started at:', mongoUri);
    } else {
      console.log('Connecting to persistent MongoDB at configured URI...');
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });

    console.log('✨ MongoDB Connected Successfully:', mongoose.connection.host);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);

    // In production, never fall back to ephemeral in-memory database
    if (env.NODE_ENV === 'production') {
      console.error('Production database connection failed. Halting process to protect data persistence.');
      throw error;
    }

    // In non-production development, fallback to embedded Mongo if Atlas is unreachable
    if (!mongodInstance) {
      console.log('Falling back to local development MongoDB...');
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongodInstance = await MongoMemoryServer.create();
        const fallbackUri = mongodInstance.getUri();
        await mongoose.connect(fallbackUri);
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
