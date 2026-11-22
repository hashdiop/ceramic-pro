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
