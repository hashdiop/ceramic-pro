import { route, searchParam } from "@/server/api";
import { createInvoice, listInvoices } from "@/server/services/invoices";
import { invoiceInputSchema } from "@/lib/schemas";

export const GET = route(async (req) =>
  listInvoices({ depotId: searchParam(req, "depotId"), limit: Number(searchParam(req, "limit")) || undefined }),
);

export const POST = route(async (req, _ctx, actor) =>
  createInvoice(invoiceInputSchema.parse(await req.json()), actor),
);
