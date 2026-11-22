import { Types } from "mongoose";
import { connectDB, withTransaction } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Product, Transfer, type TransferStatus } from "@/server/models";
import type { TransferInput, TransferReceptionInput } from "@/lib/schemas";
import { assertCanWriteDepot, type Actor } from "@/server/context";
import { applyMovement } from "./stock";
import { nextNumber } from "./numbering";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";

const POPULATE_DEPOT = "code name address phone";

function notify(fromDepot: unknown, toDepot: unknown) {
  broadcast(REALTIME_EVENTS.transfers, { fromDepot: String(fromDepot), toDepot: String(toDepot) });
  broadcast(REALTIME_EVENTS.stock, {});
}

/**
 * Création d'un transfert par le dépôt expéditeur.
 * Les compteurs physiques des deux dépôts NE CHANGENT PAS : les caisses sont
 * seulement réservées au dépôt source pour ne pas être vendues entre-temps.
 */
export async function createTransfer(input: TransferInput, actor: Actor) {
  await connectDB();
  const [from, to] = await Promise.all([Depot.findById(input.fromDepotId), Depot.findById(input.toDepotId)]);
  if (!from || !to) throw new AppError("Dépôt introuvable", 404);
  // C'est le dépôt expéditeur qui déclare le transfert.
  assertCanWriteDepot(actor, from._id, from.name, "expédier un transfert");

  // Fusionne les lignes identiques (même produit + même bain).
  const merged = new Map<string, { productId: string; lot: string; boxes: number }>();
  for (const l of input.lines) {
    const k = `${l.productId}:${l.lot}`;
    const cur = merged.get(k);
    if (cur) cur.boxes += l.boxes;
    else merged.set(k, { ...l });
  }
  const lines = [...merged.values()];
  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const transfer = await withTransaction(async (session) => {
    const number = await nextNumber("TRF", session);
    const transferId = new Types.ObjectId();
    for (const l of lines) {
      if (!byId.has(l.productId)) throw new AppError("Produit introuvable", 404);
      await applyMovement(session, {
        type: "TRANSFERT_SORTIE",
        productId: l.productId,
        depotId: from._id,
        lot: l.lot,
        delta: 0,
        reservedDelta: l.boxes,
        refType: "Transfer",
        refId: transferId,
        refNumber: number,
        actor,
      });
    }
    const [doc] = await Transfer.create(
      [
        {
          _id: transferId,
          number,
          fromDepot: from._id,
          toDepot: to._id,
          status: "EN_TRANSIT",
          driver: input.driver,
          vehicle: input.vehicle,
          note: input.note,
          createdBy: actor.id,
          createdByName: actor.name,
          sentAt: new Date(),
          lines: lines.map((l) => {
            const p = byId.get(l.productId)!;
            return {
              product: p._id,
              ref: p.ref,
              name: p.name,
              motif: p.motif,
              format: p.format,
              m2PerBox: p.m2PerBox,
              lot: l.lot,
              sentBoxes: l.boxes,
            };
          }),
        },
      ],
      { session },
    );
    return doc;
  });

  notify(from._id, to._id);
  return transfer;
}

/**
 * Validation de la réception par le dépôt destinataire.
 * Dans une seule transaction :
 *  - source       : -caisses envoyées (physique) et libération de la réservation
 *  - destination  : +caisses envoyées, puis -écart éventuel (manquant / casse transport)
 */
export async function receiveTransfer(id: string, input: TransferReceptionInput, actor: Actor) {
  await connectDB();
  const result = await withTransaction(async (session) => {
    const t = await Transfer.findById(id).session(session);
    if (!t) throw new AppError("Transfert introuvable", 404);
    if (t.status !== "EN_TRANSIT") throw new AppError(`Ce transfert est déjà ${t.status === "RECU" ? "reçu" : "annulé"}.`, 409);
    // Seul le dépôt destinataire valide la réception.
    assertCanWriteDepot(actor, t.toDepot, "le dépôt destinataire", "valider la réception");

    const received = new Map(input.lines.map((l) => [l.lineId, l]));
    for (const line of t.lines) {
      const r = received.get(String(line._id));
      if (!r) throw new AppError(`Quantité reçue manquante pour ${line.name} (bain ${line.lot}).`, 422);
      if (r.receivedBoxes > line.sentBoxes)
        throw new AppError(`${line.name} : impossible de recevoir plus que la quantité envoyée (${line.sentBoxes}).`, 422);

      const common = { productId: line.product, lot: line.lot, refType: "Transfer" as const, refId: t._id, refNumber: t.number, actor };

      await applyMovement(session, {
        ...common,
        type: "TRANSFERT_SORTIE",
        depotId: t.fromDepot,
        delta: -line.sentBoxes,
        reservedDelta: -line.sentBoxes,
        note: `Vers dépôt destinataire`,
      });
      await applyMovement(session, {
        ...common,
        type: "TRANSFERT_ENTREE",
        depotId: t.toDepot,
        delta: line.sentBoxes,
        note: `Depuis dépôt source`,
      });
      const gap = line.sentBoxes - r.receivedBoxes;
      if (gap > 0) {
        await applyMovement(session, {
          ...common,
          type: "ECART_TRANSFERT",
          depotId: t.toDepot,
          delta: -gap,
          note: r.note || "Écart constaté à la réception",
        });
      }
      line.receivedBoxes = r.receivedBoxes;
      line.note = r.note;
    }

    t.status = "RECU";
    t.receivedAt = new Date();
    t.receivedBy = input.receivedBy || actor.name;
    t.receptionNote = input.receptionNote;
    await t.save({ session });
    return t;
  });

  notify(result.fromDepot, result.toDepot);
  return result;
}

/** Annulation d'un transfert en transit : libère simplement les réservations. */
export async function cancelTransfer(id: string, actor: Actor) {
  await connectDB();
  const result = await withTransaction(async (session) => {
    const t = await Transfer.findById(id).session(session);
    if (!t) throw new AppError("Transfert introuvable", 404);
    if (t.status !== "EN_TRANSIT") throw new AppError("Seul un transfert en transit peut être annulé.", 409);
    assertCanWriteDepot(actor, t.fromDepot, "le dépôt expéditeur", "annuler ce transfert");
    for (const line of t.lines) {
      await applyMovement(session, {
        type: "TRANSFERT_SORTIE",
        productId: line.product,
        depotId: t.fromDepot,
        lot: line.lot,
        delta: 0,
        reservedDelta: -line.sentBoxes,
        actor,
      });
    }
    t.status = "ANNULE";
    t.cancelledAt = new Date();
    t.cancelledBy = actor.name;
    await t.save({ session });
    return t;
  });
  notify(result.fromDepot, result.toDepot);
  return result;
}

export async function listTransfers(opts: { status?: TransferStatus; depotId?: string; limit?: number }) {
  await connectDB();
  const q: Record<string, unknown> = {};
  if (opts.status) q.status = opts.status;
  if (opts.depotId) {
    const d = new Types.ObjectId(opts.depotId);
    q.$or = [{ fromDepot: d }, { toDepot: d }];
  }
  return Transfer.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(opts.limit ?? 100, 500))
    .populate("fromDepot", POPULATE_DEPOT)
    .populate("toDepot", POPULATE_DEPOT)
    .lean();
}

export async function getTransfer(id: string) {
  await connectDB();
  const t = await Transfer.findById(id)
    .populate("fromDepot", POPULATE_DEPOT)
    .populate("toDepot", POPULATE_DEPOT)
    .lean();
  if (!t) throw new AppError("Transfert introuvable", 404);
  return t;
}

/** Quantités actuellement en transit, regroupées par trajet et par article. */
export async function getInTransitSummary() {
  await connectDB();
  return Transfer.aggregate([
    { $match: { status: "EN_TRANSIT" } },
    { $unwind: "$lines" },
    {
      $group: {
        _id: { from: "$fromDepot", to: "$toDepot", product: "$lines.product" },
        name: { $first: "$lines.name" },
        ref: { $first: "$lines.ref" },
        m2PerBox: { $first: "$lines.m2PerBox" },
        boxes: { $sum: "$lines.sentBoxes" },
        transfers: { $addToSet: "$number" },
      },
    },
    { $lookup: { from: "depots", localField: "_id.from", foreignField: "_id", as: "from" } },
    { $lookup: { from: "depots", localField: "_id.to", foreignField: "_id", as: "to" } },
    {
      $project: {
        _id: 0,
        productId: "$_id.product",
        name: 1,
        ref: 1,
        m2PerBox: 1,
        boxes: 1,
        transfers: 1,
        from: { $arrayElemAt: ["$from.name", 0] },
        to: { $arrayElemAt: ["$to.name", 0] },
      },
    },
    { $sort: { from: 1, to: 1, name: 1 } },
  ]);
}
