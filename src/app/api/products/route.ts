import { route, searchParam } from "@/server/api";
import { createProduct, listProducts } from "@/server/services/catalog";
import { productInputSchema } from "@/lib/schemas";

/** Produits actifs (?all=1 pour inclure les archivés). */
export const GET = route(async (req) => listProducts({ includeInactive: searchParam(req, "all") === "1" }));

export const POST = route(async (req) => createProduct(productInputSchema.parse(await req.json())));
