import { route, searchParam } from "@/server/api";
import { listMovements, recordStockOperation } from "@/server/services/stock";
import { stockEntrySchema } from "@/lib/schemas";

/** Journal des mouvements (?depotId=&productId=&limit=). */
export const GET = route(async (req) =>
  listMovements({
    depotId: searchParam(req, "depotId"),
    productId: searchParam(req, "productId"),
    limit: Number(searchParam(req, "limit")) || undefined,
  }),
);

/** Entrée fournisseur, ajustement d'inventaire ou casse en dépôt. */
export const POST = route(async (req, _ctx, actor) =>
  recordStockOperation(stockEntrySchema.parse(await req.json()), actor),
);
