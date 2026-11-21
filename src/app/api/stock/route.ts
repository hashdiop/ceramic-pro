import { route, searchParam } from "@/server/api";
import { getStockOverview } from "@/server/services/stock";

/** Stock par produit × dépôt (?depotId= pour un seul dépôt). */
export const GET = route(async (req) => getStockOverview(searchParam(req, "depotId")));
