import { NextResponse } from "next/server";
import { connection } from "next/server";
import { errorResponse } from "@/server/errors";
import { getActor, type Actor } from "@/server/context";
import { assertNotInMaintenance } from "@/server/backup/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/token";

/**
 * Enveloppe commune des routes API : rendu à la demande (jamais prérendu),
 * utilisateur connecté obligatoire (RBAC), gestion des erreurs.
 */
export function route<C = unknown>(
  fn: (req: Request, ctx: C, actor: Actor) => Promise<unknown>,
  opts: { allowPendingPassword?: boolean } = {},
) {
  return async (req: Request, ctx: C) => {
    // Hors du try : pendant le build, Next interrompt ici le prérendu (signal interne à ne pas intercepter).
    await connection();
    try {
      const actor = await getActor(opts);
      // Pendant une restauration, toute écriture est refusée (503) : la base est en cours de remplacement.
      if (req.method !== "GET") await assertNotInMaintenance();
      const data = await fn(req, ctx, actor);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      const res = errorResponse(err);
      // Session refusée (compte désactivé, mot de passe changé ailleurs…) : on efface le cookie,
      // sinon le proxy, qui ne voit qu'une signature valide, renverrait sans fin de /login vers l'application.
      if (res.status === 401) res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
      return res;
    }
  };
}

/** Route accessible sans connexion (connexion, état du service). */
export function publicRoute<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    await connection();
    try {
      const data = await fn(req, ctx);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const searchParam = (req: Request, name: string) => new URL(req.url).searchParams.get(name) || undefined;
