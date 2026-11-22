import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { createProduct, listProducts } from "@/server/services/catalog";
import { productInputSchema } from "@/lib/schemas";

/** Produits actifs (?all=1 pour inclure les archivés). */
export const GET = route(async (req) => listProducts({ includeInactive: searchParam(req, "all") === "1" }));

/** Catalogue : réservé à l'administrateur. */
export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  return createProduct(productInputSchema.parse(await req.json()));
});
