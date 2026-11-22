import { route } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { updateProduct } from "@/server/services/catalog";
import { productUpdateSchema } from "@/lib/schemas";

/** Modification partielle d'un produit (active: false pour l'archiver). Réservé à l'administrateur. */
export const PATCH = route<RouteContext<"/api/products/[id]">>(async (req, ctx, actor) => {
  requireAdmin(actor);
  const { id } = await ctx.params;
  return updateProduct(id, productUpdateSchema.parse(await req.json()));
});
