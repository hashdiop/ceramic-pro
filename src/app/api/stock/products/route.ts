import { route } from "@/server/api";
import { getProductOverview } from "@/server/services/stock";

/** Stock par produit sur tout le réseau : statut global et répartition par dépôt / bain. */
export const GET = route(async () => getProductOverview());
