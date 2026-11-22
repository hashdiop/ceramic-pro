import { route } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { updateDepot } from "@/server/services/catalog";
import { depotUpdateSchema } from "@/lib/schemas";

/** Modification partielle d'un dépôt (active: false pour l'archiver). Réservé à l'administrateur. */
export const PATCH = route<RouteContext<"/api/depots/[id]">>(async (req, ctx, actor) => {
  requireAdmin(actor);
  const { id } = await ctx.params;
  return updateDepot(id, depotUpdateSchema.parse(await req.json()));
});
