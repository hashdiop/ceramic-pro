import { route } from "@/server/api";
import { env } from "@/lib/env";

/** Utilisateur connecté (accessible même avec un mot de passe provisoire). */
export const GET = route(async (_req, _ctx, actor) => ({ ...actor, demo: env.demoLogin }), { allowPendingPassword: true });
