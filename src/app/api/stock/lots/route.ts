import { route, searchParam } from "@/server/api";
import { AppError } from "@/server/errors";
import { getAvailableLots } from "@/server/services/stock";

/** Bains disponibles à la vente / au transfert pour un dépôt. */
export const GET = route(async (req) => {
  const depotId = searchParam(req, "depotId");
  if (!depotId) throw new AppError("Paramètre depotId requis", 400);
  return getAvailableLots(depotId);
});
