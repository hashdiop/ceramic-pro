import { z } from "zod";
import { route } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { restoreBackup } from "@/server/backup/service";

const body = z.object({ id: z.string().min(1), confirm: z.literal("RESTAURER", { error: "Tapez RESTAURER pour confirmer." }) });

/** Restauration complète depuis une sauvegarde stockée (sauvegarde de sécurité automatique avant). */
export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const { id } = body.parse(await req.json());
  return restoreBackup({ source: { id }, by: actor.name });
});
