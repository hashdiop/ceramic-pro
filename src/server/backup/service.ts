import type { Model } from "mongoose";
import { env } from "@/lib/env";
import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { AppState, BackupLog, Counter, Depot, Invoice, Product, StockLot, StockMovement, Transfer, User } from "@/server/models";
import { fetchBackup, listBackups, purgeTrash, putBackup, relocateImages, type StoredBackup } from "@/server/cloudinary";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";
import { contentHash, decodeBackup, encodeBackup, readManifest, type BackupData, type BackupKind, type BackupManifest } from "./format";

/**
 * Sauvegarde et restauration de la base.
 *
 * Collections sauvegardées : toutes les données métier et les comptes. Ne sont PAS sauvegardés :
 * le verrou / drapeau de maintenance (AppState) et le journal des sauvegardes (BackupLog),
 * pour qu'une restauration ne les écrase pas.
 */
const MODELS = { counters: Counter, products: Product, depots: Depot, stocklots: StockLot, stockmovements: StockMovement, transfers: Transfer, invoices: Invoice, users: User } as unknown as Record<
  string,
  Model<unknown>
>;

const LOCK_ID = "backup-lock";
const MAINTENANCE_ID = "maintenance";
const STALE_MS = 10 * 60_000; // un verrou de plus de 10 min est considéré comme abandonné

/* ------------------------------- Verrou ------------------------------- */

async function withLock<T>(op: string, by: string, fn: () => Promise<T>): Promise<T> {
  await connectDB();
  try {
    await AppState.create({ _id: LOCK_ID, at: new Date(), by, op });
  } catch {
    const taken = await AppState.findOneAndUpdate(
      { _id: LOCK_ID, at: { $lt: new Date(Date.now() - STALE_MS) } },
      { $set: { at: new Date(), by, op } },
      { returnDocument: "after" },
    );
    if (!taken) {
      const cur = await AppState.findById(LOCK_ID).lean();
      throw new AppError(`Une opération est déjà en cours (${cur?.op ?? "sauvegarde"} par ${cur?.by || "quelqu'un"}). Réessayez dans un instant.`, 409);
    }
  }
  try {
    return await fn();
  } finally {
    await AppState.deleteOne({ _id: LOCK_ID });
  }
}

/** Refuse les écritures pendant une restauration (appelé par l'enveloppe des routes API). */
export async function assertNotInMaintenance() {
  await connectDB();
  const m = await AppState.findById(MAINTENANCE_ID).lean();
  if (m && Date.now() - new Date(m.at).getTime() < STALE_MS) {
    throw new AppError("Restauration de la base en cours : les enregistrements sont suspendus quelques instants.", 503);
  }
}

/* ------------------------------ Lecture ------------------------------ */

/** Lecture cohérente de toutes les collections (snapshot MongoDB : un seul instant pour tout). */
async function snapshot(): Promise<BackupData> {
  const conn = await connectDB();
  const session = conn.connection.getClient().startSession({ snapshot: true });
  try {
    const data: BackupData = {};
    for (const [name, model] of Object.entries(MODELS)) {
      data[name] = (await model.collection.find({}, { session }).toArray()) as Record<string, unknown>[];
    }
    return data;
  } finally {
    await session.endSession();
  }
}

const countsOf = (data: BackupData) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));

export async function currentCounts() {
  await connectDB();
  const out: Record<string, number> = {};
  for (const [name, model] of Object.entries(MODELS)) out[name] = await model.collection.countDocuments();
  return out;
}

/* ------------------------------ Sauvegarde ------------------------------ */

export interface BackupResult {
  id: string;
  bytes: number;
  manifest: BackupManifest;
  duplicateOf?: StoredBackup;
}

async function createBackupUnlocked(opts: { kind: BackupKind; by: string; note?: string }): Promise<BackupResult> {
  const data = await snapshot();
  const hash = contentHash(data);
  const latest = (await listBackups())[0];
  if (latest && latest.contentHash === hash) {
    // Doublon : rien n'a changé depuis la dernière sauvegarde.
    if (opts.kind === "AVANT_RESTAURATION") {
      return { id: latest.id, bytes: latest.bytes, manifest: { ...readManifestStub(latest) }, duplicateOf: latest };
    }
    throw new AppError(`Rien n'a changé depuis la sauvegarde du ${new Date(latest.createdAt).toLocaleString("fr-FR", { timeZone: "Africa/Dakar" })} : nouvelle sauvegarde inutile.`, 409);
  }
  const { file, manifest } = encodeBackup(
    { createdAt: new Date().toISOString(), kind: opts.kind, by: opts.by, note: opts.note ?? "", database: env.mongodbDb, counts: countsOf(data), contentHash: hash },
    data,
    env.backupKey,
  );
  const stored = await putBackup(file, manifest);
  await BackupLog.create({ action: "SAUVEGARDE", backupId: stored.id, by: opts.by, detail: `${opts.kind}${opts.note ? ` · ${opts.note}` : ""}` });
  // Entretien : la corbeille des photos est vidée de ce qui dépasse 60 jours.
  await purgeTrash().catch((e) => console.error("[sauvegarde] corbeille", e));
  return { ...stored, manifest };
}

function readManifestStub(b: StoredBackup): BackupManifest {
  return { format: 1, app: "ceramique-pro", createdAt: b.createdAt, kind: b.kind as BackupKind, by: b.by, note: b.note, database: env.mongodbDb, counts: b.counts, contentHash: b.contentHash, dataHash: "" };
}

export function createBackup(opts: { kind?: BackupKind; by: string; note?: string }) {
  return withLock("sauvegarde", opts.by, () => createBackupUnlocked({ kind: opts.kind ?? "MANUELLE", ...opts }));
}

/* ------------------------------ Liste / aperçu ------------------------------ */

/** Liste des sauvegardes avec, pour chacune, ce qu'elle apporte par rapport à la précédente. */
export async function listBackupsWithDelta() {
  const list = await listBackups();
  return list.map((b, i) => {
    const prev = list[i + 1];
    const delta = prev ? Object.fromEntries(Object.keys(b.counts).map((k) => [k, (b.counts[k] ?? 0) - (prev.counts[k] ?? 0)])) : null;
    return { ...b, delta };
  });
}

/** Ce que changerait la restauration : écart entre la sauvegarde et la base actuelle. */
export async function previewRestore(id: string) {
  const b = (await listBackups()).find((x) => x.id === id);
  if (!b) throw new AppError("Sauvegarde introuvable.", 404);
  const now = await currentCounts();
  return { backup: b, current: now, diff: Object.fromEntries(Object.keys({ ...now, ...b.counts }).map((k) => [k, (b.counts[k] ?? 0) - (now[k] ?? 0)])) };
}

/* ------------------------------ Restauration ------------------------------ */

export interface RestoreResult {
  manifest: BackupManifest;
  safetyBackupId: string | null;
  counts: Record<string, number>;
  photos: { restored: number; missing: string[] };
}

/**
 * Restauration complète :
 *  1. fichier vérifié (déchiffrement + empreinte) AVANT toute écriture ;
 *  2. sauvegarde de sécurité de l'état actuel (sauf base vide) ;
 *  3. mode maintenance (écritures refusées) ;
 *  4. index recréés (base supprimée), puis remplacement de toutes les collections dans UNE transaction ;
 *  5. contrôle des nombres d'éléments, photos remises en place.
 */
export function restoreBackup(opts: { source: { id: string } | { file: Buffer }; by: string; safety?: boolean }) {
  return withLock("restauration", opts.by, async () => {
    const file = "id" in opts.source ? await fetchBackup(opts.source.id) : opts.source.file;
    const { manifest, data } = decodeBackup(file, env.backupKey);
    for (const name of Object.keys(data)) if (!MODELS[name]) throw new AppError(`Collection inconnue dans la sauvegarde : ${name}.`, 422);

    const before = await currentCounts();
    const empty = Object.values(before).every((n) => n === 0);
    let safetyBackupId: string | null = null;
    if (opts.safety !== false && !empty) {
      safetyBackupId = (await createBackupUnlocked({ kind: "AVANT_RESTAURATION", by: opts.by, note: `avant restauration du ${manifest.createdAt}` })).id;
    }

    const conn = await connectDB();
    await AppState.updateOne({ _id: MAINTENANCE_ID }, { $set: { at: new Date(), by: opts.by, op: "restauration" } }, { upsert: true });
    try {
      // Base supprimée : collections et index (unicité des références, e-mails, numéros) sont recréés d'abord.
      for (const model of Object.values(MODELS)) {
        await model.createCollection().catch(() => undefined);
        await model.syncIndexes();
      }
      const session = await conn.startSession();
      try {
        await session.withTransaction(async () => {
          for (const [name, model] of Object.entries(MODELS)) {
            await model.collection.deleteMany({}, { session });
            const docs = data[name] ?? [];
            if (docs.length) await model.collection.insertMany(docs as never[], { session, ordered: true });
          }
        });
      } finally {
        await session.endSession();
      }
      const after = await currentCounts();
      for (const [name, n] of Object.entries(manifest.counts)) {
        if (after[name] !== n) throw new AppError(`Contrôle échoué après restauration : ${name} = ${after[name]} au lieu de ${n}.`, 500);
      }
      const photos = await relocateImages(((data.products ?? []) as { imagePublicId?: string }[]).map((p) => p.imagePublicId ?? "")).catch((e) => {
        console.error("[restauration] photos", e);
        return { restored: 0, missing: [] as string[] };
      });
      await BackupLog.create({ action: "RESTAURATION", backupId: "id" in opts.source ? opts.source.id : "fichier importé", by: opts.by, detail: `sauvegarde du ${manifest.createdAt}` });
      for (const e of Object.values(REALTIME_EVENTS)) broadcast(e, { restored: true });
      return { manifest, safetyBackupId, counts: after, photos } satisfies RestoreResult;
    } finally {
      await AppState.deleteOne({ _id: MAINTENANCE_ID });
    }
  });
}

export async function backupHistory(limit = 20) {
  await connectDB();
  return BackupLog.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export { readManifest };
