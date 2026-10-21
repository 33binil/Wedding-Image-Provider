import mongoose from 'mongoose';
import { env } from './env.js';

let mongodInstance: any = null;

export async function connectDB(): Promise<void> {
  try {
    let mongoUri = env.MONGODB_URI;

    if (!mongoUri) {
      console.log('ℹ️ MONGODB_URI not provided in .env. Initializing embedded MongoDB engine for development...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create();
      mongoUri = mongodInstance.getUri();
      console.log('✅ Embedded MongoDB started at:', mongoUri);
    } else {
      console.log('Connecting to MongoDB Atlas at configured URI...');
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });

    console.log('✨ MongoDB Connected Successfully:', mongoose.connection.host);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    // If Atlas failed and we didn't try embedded yet, fallback to embedded Mongo
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
