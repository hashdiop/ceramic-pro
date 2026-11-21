import { route } from "@/server/api";
import { createDepot, listDepots } from "@/server/services/catalog";
import { depotInputSchema } from "@/lib/schemas";

export const GET = route(async () => listDepots());

export const POST = route(async (req) => createDepot(depotInputSchema.parse(await req.json())));
