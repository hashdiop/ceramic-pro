import { route } from "@/server/api";
import { signUpload } from "@/server/cloudinary";

/**
 * Signature d'upload Cloudinary (non utilisée par l'interface pour l'instant).
 * Renvoie 503 tant que les variables CLOUDINARY_* ne sont pas renseignées.
 */
export const POST = route(async () => signUpload("products"));
