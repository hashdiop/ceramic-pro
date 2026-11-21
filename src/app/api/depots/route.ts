import { route, searchParam } from "@/server/api";
import { createDepot, listDepots } from "@/server/services/catalog";
import { depotInputSchema } from "@/lib/schemas";

/** Dépôts actifs (?all=1 pour inclure les archivés). */
export const GET = route(async (req) => listDepots({ includeInactive: searchParam(req, "all") === "1" }));

export const POST = route(async (req) => createDepot(depotInputSchema.parse(await req.json())));
