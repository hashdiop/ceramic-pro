/**
 * Images produits sur Cloudinary.
 *
 * - Upload : le navigateur demande une signature (POST /api/uploads/sign) puis envoie
 *   le fichier directement à Cloudinary ; le secret API ne quitte jamais le serveur.
 * - Remplacement / retrait : l'ancienne image est supprimée après l'enregistrement du produit.
 * - Archivage : l'image est déplacée dans <dossier>/archives, et revient dans
 *   <dossier>/products à la réactivation (rien n'est perdu).
 */
import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";
import { AppError } from "@/server/errors";

let configured = false;

function ensureConfigured() {
  if (!env.cloudinary.enabled) {
    throw new AppError("Cloudinary n'est pas configuré (variables CLOUDINARY_* absentes).", 503);
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export const isCloudinaryEnabled = () => env.cloudinary.enabled;

const ACTIVE = "products";
const ARCHIVED = "archives";
const folderOf = (sub: string) => `${env.cloudinary.folder}/${sub}`;

/** Seules les images de nos dossiers peuvent être enregistrées, déplacées ou supprimées. */
export function isOwnedPublicId(publicId: string) {
  return publicId.startsWith(`${folderOf(ACTIVE)}/`) || publicId.startsWith(`${folderOf(ARCHIVED)}/`);
}

export function assertOwnedPublicId(publicId: string) {
  if (publicId && !isOwnedPublicId(publicId)) throw new AppError("Image non reconnue.", 400);
}

/**
 * Paramètres signés pour un upload direct navigateur → Cloudinary.
 * Le navigateur renvoie `params` tels quels avec le fichier (ils font partie de la signature).
 */
export function signUpload() {
  const c = ensureConfigured();
  const params = {
    timestamp: Math.round(Date.now() / 1000),
    folder: folderOf(ACTIVE),
    allowed_formats: "jpg,jpeg,png,webp,avif,heic",
  };
  const signature = c.utils.api_sign_request(params, env.cloudinary.apiSecret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`,
    params: { ...params, signature, api_key: env.cloudinary.apiKey },
  };
}

export async function deleteImage(publicId: string) {
  if (!publicId || !isOwnedPublicId(publicId)) return;
  const c = ensureConfigured();
  await c.uploader.destroy(publicId, { invalidate: true });
}

/** Suppression sans bloquer l'opération principale (image déjà absente, réseau…). */
export async function deleteImageQuietly(publicId: string) {
  try {
    await deleteImage(publicId);
  } catch (err) {
    console.error("[cloudinary] suppression impossible", publicId, err);
  }
}

/** Déplace l'image vers archives (archive = true) ou vers products (archive = false). */
export async function moveImage(publicId: string, archive: boolean): Promise<{ url: string; publicId: string }> {
  const c = ensureConfigured();
  const [from, to] = archive ? [folderOf(ACTIVE), folderOf(ARCHIVED)] : [folderOf(ARCHIVED), folderOf(ACTIVE)];
  if (!publicId.startsWith(`${from}/`)) throw new AppError("Image hors du dossier attendu.", 400);
  const target = `${to}/${publicId.slice(from.length + 1)}`;
  const res = await c.uploader.rename(publicId, target, { overwrite: false, invalidate: true });
  return { url: res.secure_url, publicId: res.public_id };
}

/* -------------------------------------------------------------------------- */
/*  Corbeille des photos : une photo remplacée ou retirée est gardée 60 jours  */
/*  (durée de vie des sauvegardes), pour qu'une restauration la retrouve.      */
/* -------------------------------------------------------------------------- */

const TRASH = "trash";
export const TRASH_DAYS = 60;
const baseName = (publicId: string) => publicId.slice(publicId.lastIndexOf("/") + 1);

/** Met une photo à la corbeille au lieu de la supprimer (sans bloquer l'opération principale). */
export async function trashImageQuietly(publicId: string) {
  if (!publicId || !isOwnedPublicId(publicId)) return;
  try {
    const c = ensureConfigured();
    const target = `${folderOf(TRASH)}/${baseName(publicId)}`;
    await c.uploader.rename(publicId, target, { overwrite: true, invalidate: true });
    await c.uploader.explicit(target, { type: "upload", context: `deleted_at=${new Date().toISOString()}` });
  } catch (err) {
    console.error("[cloudinary] mise à la corbeille impossible", publicId, err);
  }
}

/** Toutes les images de nos dossiers (une requête par lot de 500). */
async function listImages(prefix: string) {
  const c = ensureConfigured();
  const out: { public_id: string; context?: { custom?: Record<string, string> } }[] = [];
  let cursor: string | undefined;
  do {
    const r = await c.api.resources({ type: "upload", resource_type: "image", prefix, context: true, max_results: 500, next_cursor: cursor });
    out.push(...r.resources);
    cursor = r.next_cursor;
  } while (cursor);
  return out;
}

/** Vide la corbeille des photos plus vieilles que TRASH_DAYS. Renvoie le nombre supprimé. */
export async function purgeTrash(days = TRASH_DAYS) {
  if (!isCloudinaryEnabled()) return 0;
  const c = ensureConfigured();
  const cutoff = Date.now() - days * 86400_000;
  const old = (await listImages(`${folderOf(TRASH)}/`)).filter((r) => {
    const at = Date.parse(r.context?.custom?.deleted_at ?? "");
    return Number.isFinite(at) && at < cutoff;
  });
  for (const r of old) await c.uploader.destroy(r.public_id, { invalidate: true });
  return old.length;
}

/**
 * Après une restauration : chaque photo référencée doit exister à l'emplacement attendu.
 * Si elle est ailleurs (corbeille, ou archives ⇄ produits depuis la sauvegarde), on la remet en place.
 */
export async function relocateImages(publicIds: string[]) {
  const wanted = [...new Set(publicIds.filter((id) => id && isOwnedPublicId(id)))];
  if (!wanted.length || !isCloudinaryEnabled()) return { restored: 0, missing: [] as string[] };
  const c = ensureConfigured();
  const existing = new Set((await listImages(`${env.cloudinary.folder}/`)).map((r) => r.public_id));
  let restored = 0;
  const missing: string[] = [];
  for (const id of wanted) {
    if (existing.has(id)) continue;
    const candidates = [ACTIVE, ARCHIVED, TRASH].map((f) => `${folderOf(f)}/${baseName(id)}`).filter((p) => existing.has(p));
    if (!candidates.length) {
      missing.push(id);
      continue;
    }
    await c.uploader.rename(candidates[0], id, { overwrite: false, invalidate: true });
    restored++;
  }
  return { restored, missing };
}

/* -------------------------------------------------------------------------- */
/*  Stockage des sauvegardes : fichiers « raw » privés (type authenticated)     */
/* -------------------------------------------------------------------------- */

const BACKUPS = "backups";
const RAW = { resource_type: "raw" as const, type: "authenticated" as const };

export interface StoredBackup {
  id: string;
  bytes: number;
  createdAt: string;
  kind: string;
  by: string;
  note: string;
  contentHash: string;
  counts: Record<string, number>;
}

const encodeCounts = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k}:${v}`).join(",");
const decodeCounts = (s = "") => Object.fromEntries(s.split(",").filter(Boolean).map((p) => [p.split(":")[0], Number(p.split(":")[1])]));
// Les métadonnées Cloudinary utilisent | et = comme séparateurs.
const clean = (s: string) => s.replace(/[|=]/g, " ").slice(0, 200);

export async function putBackup(file: Buffer, m: { createdAt: string; kind: string; by: string; note: string; contentHash: string; counts: Record<string, number> }) {
  const c = ensureConfigured();
  const stamp = m.createdAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const id = `${folderOf(BACKUPS)}/cpro-${stamp}-${m.kind.toLowerCase()}.cpb`;
  const context = [`at=${m.createdAt}`, `kind=${m.kind}`, `by=${clean(m.by)}`, `note=${clean(m.note)}`, `hash=${m.contentHash}`, `counts=${encodeCounts(m.counts)}`].join("|");
  const res = await new Promise<{ public_id: string; bytes: number }>((resolve, reject) =>
    c.uploader.upload_stream({ ...RAW, public_id: id, overwrite: false, tags: ["cpro-backup"], context }, (e, r) => (e || !r ? reject(e) : resolve(r))).end(file),
  );
  return { id: res.public_id, bytes: res.bytes };
}

/** Sauvegardes stockées, de la plus récente à la plus ancienne (métadonnées seules, sans téléchargement). */
export async function listBackups(): Promise<StoredBackup[]> {
  const c = ensureConfigured();
  const out: StoredBackup[] = [];
  let cursor: string | undefined;
  do {
    const r = await c.api.resources({ ...RAW, prefix: `${folderOf(BACKUPS)}/`, context: true, max_results: 500, next_cursor: cursor });
    for (const x of r.resources) {
      const ctx: Record<string, string> = x.context?.custom ?? {};
      out.push({
        id: x.public_id,
        bytes: x.bytes,
        createdAt: ctx.at ?? x.created_at,
        kind: ctx.kind ?? "?",
        by: ctx.by ?? "",
        note: ctx.note ?? "",
        contentHash: ctx.hash ?? "",
        counts: decodeCounts(ctx.counts),
      });
    }
    cursor = r.next_cursor;
  } while (cursor);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const assertBackupId = (id: string) => {
  if (!id.startsWith(`${folderOf(BACKUPS)}/`) || !id.endsWith(".cpb")) throw new AppError("Sauvegarde inconnue.", 404);
};

/** Lien de téléchargement signé, valable quelques minutes. */
export function backupDownloadUrl(id: string, minutes = 5) {
  assertBackupId(id);
  return ensureConfigured().utils.private_download_url(id, "", { ...RAW, expires_at: Math.floor(Date.now() / 1000) + minutes * 60, attachment: true });
}

export async function fetchBackup(id: string): Promise<Buffer> {
  const res = await fetch(backupDownloadUrl(id, 2));
  if (!res.ok) throw new AppError(`Sauvegarde introuvable sur Cloudinary (${res.status}).`, 404);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteBackup(id: string) {
  assertBackupId(id);
  await ensureConfigured().uploader.destroy(id, { ...RAW, invalidate: true });
}
