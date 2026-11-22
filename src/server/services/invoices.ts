import { Types } from "mongoose";
import { connectDB, withTransaction } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Invoice, Product, StockLot } from "@/server/models";
import type { InvoiceInput } from "@/lib/schemas";
import { assertCanWriteDepot, type Actor } from "@/server/context";
import { computeInvoice, type CalcProduct } from "@/lib/invoice-calc";
import { applyMovement } from "./stock";
import { nextNumber } from "./numbering";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";

const toCalc = (p: { _id: unknown; ref: string; name: string; motif: string; format: string; m2PerBox: number; pricePerM2: number }): CalcProduct => ({
  id: String(p._id),
  ref: p.ref,
  name: p.name,
  motif: p.motif,
  format: p.format,
  m2PerBox: p.m2PerBox,
  pricePerM2: p.pricePerM2,
});

/**
 * Enregistre une vente : recalcul serveur (le navigateur ne fait pas foi),
 * sortie de stock par bain dans le dépôt choisi, numérotation atomique.
 */
export async function createInvoice(input: InvoiceInput, actor: Actor) {
  await connectDB();
  const depot = await Depot.findById(input.depotId);
  if (!depot) throw new AppError("Dépôt introuvable", 404);
  assertCanWriteDepot(actor, depot._id, depot.name, "vendre");

  const ids =[...input.lines.map((l) => l.productId), ...(input.breakage ? [input.breakage.productId] : [])];
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const product = (id: string) => {
    const p = byId.get(id);
    if (!p) throw new AppError("Produit introuvable", 404);
    return toCalc(p);
  };

  // Une ligne par produit : on regroupe les doublons éventuels.
  const lineMap = new Map<string, { productId: string; requestedM2: number; lot?: string }>();
  for (const l of input.lines) {
    const k = `${l.productId}:${l.lot ?? ""}`;
    const cur = lineMap.get(k);
    if (cur) cur.requestedM2 += l.requestedM2;
    else lineMap.set(k, { ...l });
  }

  const calc = computeInvoice(
    [...lineMap.values()].map((l) => ({ product: product(l.productId), requestedM2: l.requestedM2, lot: l.lot || undefined })),
    input.breakage ? { product: product(input.breakage.productId), unit: input.breakage.unit, quantity: input.breakage.quantity } : null,
  );
  if (calc.error) throw new AppError(calc.error, 422);

  const invoice = await withTransaction(async (session) => {
    const number = await nextNumber("FAC", session);
    const invoiceId = new Types.ObjectId();

    const lines = [];
    for (const l of calc.lines) {
      // Bain choisi par le vendeur, sinon le bain qui couvre toute la ligne avec le plus de stock.
      let lot = l.lot;
      if (!lot) {
        const candidates = await StockLot.find({ product: l.product.id, depot: depot._id })
          .session(session)
          .lean();
        const best = candidates
          .map((c) => ({ lot: c.lot, available: c.onHandBoxes - c.reservedBoxes }))
          .filter((c) => c.available >= l.boxes)
          .sort((a, b) => b.available - a.available)[0];
        if (!best) {
          const total = candidates.reduce((s, c) => s + Math.max(0, c.onHandBoxes - c.reservedBoxes), 0);
          throw new AppError(
            `${l.product.name} : aucun bain ne couvre ${l.boxes} caisse(s) au dépôt ${depot.name} (disponible tous bains : ${total}). Choisissez un bain ou réduisez la quantité.`,
            409,
          );
        }
        lot = best.lot;
      }

      await applyMovement(session, {
        type: "VENTE",
        productId: l.product.id,
        depotId: depot._id,
        lot,
        delta: -l.boxes,
        checkAvailable: true,
        refType: "Invoice",
        refId: invoiceId,
        refNumber: number,
        actor,
      });

      lines.push({
        product: new Types.ObjectId(l.product.id),
        ref: l.product.ref,
        name: l.product.name,
        motif: l.product.motif,
        format: l.product.format,
        m2PerBox: l.product.m2PerBox,
        pricePerM2: l.product.pricePerM2,
        lot,
        requestedM2: l.requestedM2,
        boxes: l.boxes,
        billedM2: l.billedM2,
        lineTotal: l.lineTotal,
      });
    }

    const [doc] = await Invoice.create(
      [
        {
          _id: invoiceId,
          number,
          depot: depot._id,
          client: { ...input.client, name: input.client.name || "Client Comptoir" },
          paymentMethod: input.paymentMethod,
          lines,
          totalM2: calc.totalM2,
          subtotal: calc.subtotal,
          breakage: calc.breakage
            ? {
                product: new Types.ObjectId(calc.breakage.product.id),
                name: calc.breakage.product.name,
                unit: calc.breakage.unit,
                quantity: calc.breakage.quantity,
                m2: calc.breakage.m2,
                amount: calc.breakage.amount,
              }
            : undefined,
          breakageAmount: calc.breakageAmount,
          netTotal: calc.netTotal,
          createdBy: actor.id,
          createdByName: actor.name,
        },
      ],
      { session },
    );
    return doc;
  });

  broadcast(REALTIME_EVENTS.invoices, { number: invoice.number });
  broadcast(REALTIME_EVENTS.stock, { depotId: String(depot._id) });
  return invoice;
}

export async function listInvoices(opts: { limit?: number; depotId?: string }) {
  await connectDB();
  const q: Record<string, unknown> = {};
  if (opts.depotId) q.depot = new Types.ObjectId(opts.depotId);
  return Invoice.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(opts.limit ?? 100, 500))
    .populate("depot", "code name")
    .lean();
}

export async function getInvoice(id: string) {
  await connectDB();
  const inv = await Invoice.findById(id).populate("depot", "code name address phone").lean();
  if (!inv) throw new AppError("Facture introuvable", 404);
  return inv;
}
