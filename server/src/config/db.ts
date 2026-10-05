import mongoose from 'mongoose';
import { env } from './env';

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDb(uri = env.mongoUri) {
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err?.message || err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected. Mongoose will attempt to reconnect.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[db] MongoDB reconnected');
  });

  await mongoose.connect(uri, {
    maxPoolSize: Number(process.env.DB_MAX_POOL_SIZE || 50),
    minPoolSize: Number(process.env.DB_MIN_POOL_SIZE || 5),
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 10000,
  });

  return mongoose.connection;
}

export async function closeDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[db] MongoDB connection closed gracefully');
  }
}
