import mongoose, { type ClientSession } from "mongoose";
import { env } from "@/lib/env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongo = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = globalForMongo.__mongoose ?? { conn: null, promise: null };
globalForMongo.__mongoose = cache;

/** Connexion MongoDB réutilisée entre les requêtes (et entre les rechargements en dev). */
export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.mongodbUri, { dbName: env.mongodbDb, bufferCommands: false })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Exécute `fn` dans une transaction MongoDB : soit toutes les écritures
 * sont appliquées, soit aucune. Nécessite un replica set (MongoDB Atlas).
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const conn = await connectDB();
  const session = await conn.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
