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
      .connect(env.mongodbUri, {
        dbName: env.mongodbDb,
        bufferCommands: false,
        // Par défaut le driver attend indéfiniment (socketTimeoutMS: 0) et garde les connexions
        // inactives ouvertes (maxIdleTimeMS: 0). Une box ou un partage 4G coupe ces connexions
        // en silence : la requête suivante restait alors bloquée et le bouton figé sur « Enregistrement… ».
        maxIdleTimeMS: 60_000, // ferme les connexions inactives avant que le réseau ne les coupe
        socketTimeoutMS: 45_000, // une requête sans réponse échoue au lieu de bloquer
        serverSelectionTimeoutMS: 10_000, // Atlas injoignable : erreur claire en 10 s au lieu de 30 s
        connectTimeoutMS: 10_000,
      })
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
