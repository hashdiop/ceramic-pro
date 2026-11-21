import { route, searchParam } from "@/server/api";
import { createTransfer, listTransfers } from "@/server/services/transfers";
import { transferInputSchema } from "@/lib/schemas";
import { TRANSFER_STATUS, type TransferStatus } from "@/server/models";

export const GET = route(async (req) => {
  const status = searchParam(req, "status");
  return listTransfers({
    status: TRANSFER_STATUS.includes(status as TransferStatus) ? (status as TransferStatus) : undefined,
    depotId: searchParam(req, "depotId"),
  });
});

export const POST = route(async (req, _ctx, actor) =>
  createTransfer(transferInputSchema.parse(await req.json()), actor),
);
