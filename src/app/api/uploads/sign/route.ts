import { route } from "@/server/api";
import { signUpload } from "@/server/cloudinary";

/** Signature d'un upload direct navigateur → Cloudinary (503 si Cloudinary n'est pas configuré). */
export const POST = route(async () => signUpload());
