import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { createDepot, listDepots } from "@/server/services/catalog";
import { depotInputSchema } from "@/lib/schemas";

/** Dépôts actifs (?all=1 pour inclure les archivés). Lisible aussi avec un mot de passe provisoire (page Mon compte). */
export const GET = route(async (req) => listDepots({ includeInactive: searchParam(req, "all") === "1" }), { allowPendingPassword: true });

/** Réservé à l'administrateur. */
export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  return createDepot(depotInputSchema.parse(await req.json()));
});
