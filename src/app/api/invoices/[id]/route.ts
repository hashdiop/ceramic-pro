import { route } from "@/server/api";
import { getInvoice } from "@/server/services/invoices";

export const GET = route<RouteContext<"/api/invoices/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return getInvoice(id);
});
