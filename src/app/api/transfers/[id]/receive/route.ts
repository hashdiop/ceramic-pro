import { route } from "@/server/api";
import { receiveTransfer } from "@/server/services/transfers";
import { transferReceptionSchema } from "@/lib/schemas";

/** Validation de la réception par le dépôt destinataire. */
export const POST = route<RouteContext<"/api/transfers/[id]/receive">>(async (req, ctx, actor) => {
  const { id } = await ctx.params;
  return receiveTransfer(id, transferReceptionSchema.parse(await req.json()), actor);
});
