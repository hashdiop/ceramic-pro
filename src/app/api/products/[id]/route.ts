import { route } from "@/server/api";
import { updateProduct } from "@/server/services/catalog";
import { productInputSchema } from "@/lib/schemas";

export const PATCH = route<RouteContext<"/api/products/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  return updateProduct(id, productInputSchema.partial().parse(await req.json()));
});
