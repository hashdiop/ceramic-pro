import { route } from "@/server/api";

/** Utilisateur connecté (accessible même avec un mot de passe provisoire). */
export const GET = route(async (_req, _ctx, actor) => actor, { allowPendingPassword: true });
