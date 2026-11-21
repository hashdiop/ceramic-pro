import { route } from "@/server/api";
import { updateDepot } from "@/server/services/catalog";
import { depotUpdateSchema } from "@/lib/schemas";

/** Modification partielle d'un dépôt (active: false pour l'archiver). */
export const PATCH = route<RouteContext<"/api/depots/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  return updateDepot(id, depotUpdateSchema.parse(await req.json()));
});
