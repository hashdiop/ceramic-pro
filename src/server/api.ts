import { NextResponse } from "next/server";
import { connection } from "next/server";
import { errorResponse } from "@/server/errors";
import { getActor, type Actor } from "@/server/context";

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
      const data = await fn(req, ctx, actor);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
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
