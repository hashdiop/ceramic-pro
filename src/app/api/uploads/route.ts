import { z } from "zod";
import { route } from "@/server/api";
import { discardUnusedImage } from "@/server/services/catalog";

const body = z.object({ publicId: z.string().trim().min(1).max(200) });

/**
 * Supprime une image envoyée puis abandonnée (formulaire fermé sans enregistrer).
 * Refusé si l'image est utilisée par un produit ou n'appartient pas à nos dossiers.
 */
export const DELETE = route(async (req) => {
  const { publicId } = body.parse(await req.json());
  await discardUnusedImage(publicId);
  return { ok: true };
});
