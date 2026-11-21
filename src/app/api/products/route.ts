import { route } from "@/server/api";
import { createProduct, listProducts } from "@/server/services/catalog";
import { productInputSchema } from "@/lib/schemas";

export const GET = route(async () => listProducts());

export const POST = route(async (req) => createProduct(productInputSchema.parse(await req.json())));
