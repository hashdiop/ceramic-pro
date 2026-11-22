"use client";

import { ApiError, apiPost } from "./api";

export interface UploadedImage {
  url: string;
  publicId: string;
}

const MAX_SIDE = 1600; // px : largement suffisant pour une vignette produit
const MAX_BYTES = 10 * 1024 * 1024; // limite Cloudinary (offre gratuite)

/**
 * Réduit une photo de téléphone (souvent 4 à 12 Mo) avant l'envoi : plus rapide en 4G,
 * et moins d'espace Cloudinary. Si le navigateur ne sait pas la lire (ex. HEIC), on envoie l'original.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Envoie une image directement à Cloudinary avec une signature fournie par le serveur. */
export async function uploadProductImage(file: File, onProgress?: (pct: number) => void): Promise<UploadedImage> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new ApiError("Choisissez une image (JPG, PNG, WebP…).");
  const blob = await shrink(file);
  if (blob.size > MAX_BYTES) throw new ApiError("Image trop lourde (10 Mo maximum).");

  const { uploadUrl, params } = await apiPost<{ uploadUrl: string; params: Record<string, string | number> }>("/api/uploads/sign");
  const form = new FormData();
  Object.entries(params).forEach(([k, v]) => form.append(k, String(v)));
  form.append("file", blob, file.name.replace(/\.\w+$/, "") + ".jpg");

  return new Promise<UploadedImage>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return {};
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) resolve({ url: body.secure_url, publicId: body.public_id });
      else reject(new ApiError(`Envoi de l'image refusé${body?.error?.message ? ` : ${body.error.message}` : ""}.`));
    };
    xhr.onerror = () => reject(new ApiError("Envoi de l'image impossible. Vérifiez votre réseau."));
    xhr.ontimeout = () => reject(new ApiError("Envoi de l'image trop long. Réessayez avec une connexion plus stable."));
    xhr.send(form);
  });
}

/** Supprime une image envoyée mais jamais enregistrée (sans bloquer l'interface). */
export function discardImage(publicId: string) {
  fetch("/api/uploads", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicId }),
    keepalive: true, // part même si la page se ferme
  }).catch(() => {});
}
