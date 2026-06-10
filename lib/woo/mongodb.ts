import mongoose from 'mongoose';

const globalWithMongoose = global as typeof globalThis & {
  wooMongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};

const cached = globalWithMongoose.wooMongoose || { conn: null, promise: null };
globalWithMongoose.wooMongoose = cached;

export async function connectWooMongo(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017/integrador';
    cached.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
