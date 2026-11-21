/**
 * Intégration Cloudinary — prête mais NON utilisée pour l'instant :
 * le jeu de données d'exemple utilise des images locales (/public/tiles).
 *
 * Pour l'activer : renseigner CLOUDINARY_* dans .env.local, puis
 * appeler POST /api/uploads/sign depuis le formulaire produit et envoyer
 * le fichier directement à Cloudinary (upload signé, le secret reste côté serveur).
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

/** Signature pour un upload direct navigateur → Cloudinary. */
export function signUpload(subfolder = "products") {
  const c = ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${env.cloudinary.folder}/${subfolder}`;
  const signature = c.utils.api_sign_request({ timestamp, folder }, env.cloudinary.apiSecret);
  return {
    timestamp,
    folder,
    signature,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`,
  };
}

/** Upload côté serveur (ex. import en masse depuis un fichier ou une URL). */
export async function uploadImage(source: string, subfolder = "products") {
  const c = ensureConfigured();
  const res = await c.uploader.upload(source, {
    folder: `${env.cloudinary.folder}/${subfolder}`,
    resource_type: "image",
  });
  return { url: res.secure_url, publicId: res.public_id, width: res.width, height: res.height };
}

export async function deleteImage(publicId: string) {
  const c = ensureConfigured();
  await c.uploader.destroy(publicId);
}
