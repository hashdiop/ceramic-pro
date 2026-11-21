import { route } from "@/server/api";
import { getInTransitSummary } from "@/server/services/transfers";

export const GET = route(async () => getInTransitSummary());
