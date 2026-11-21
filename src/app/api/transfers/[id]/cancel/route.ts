import { route } from "@/server/api";
import { cancelTransfer } from "@/server/services/transfers";

export const POST = route<RouteContext<"/api/transfers/[id]/cancel">>(async (_req, ctx, actor) => {
  const { id } = await ctx.params;
  return cancelTransfer(id, actor);
});
