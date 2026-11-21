import { route } from "@/server/api";
import { getTransfer } from "@/server/services/transfers";

export const GET = route<RouteContext<"/api/transfers/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return getTransfer(id);
});
