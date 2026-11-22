import { Types, type ClientSession } from "mongoose";
import { connectDB, withTransaction } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Product, StockLot, StockMovement, Transfer, type MovementType } from "@/server/models";
import type { StockEntryInput } from "@/lib/schemas";
import { assertCanWriteDepot, type Actor } from "@/server/context";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";

const oid = (id: string | Types.ObjectId) => (typeof id === "string" ? new Types.ObjectId(id) : id);

interface MoveArgs {
  type: MovementType;
  productId: string | Types.ObjectId;
  depotId: string | Types.ObjectId;
  lot: string;
  /** Variation signée de caisses physiques. */
  delta: number;
  /** Variation signée des caisses réservées (transferts). */
  reservedDelta?: number;
  /** Si vrai, la sortie ne peut consommer que du stock disponible (non réservé). */
  checkAvailable?: boolean;
  refType?: "Invoice" | "Transfer" | "Manual";
  refId?: Types.ObjectId;
  refNumber?: string;
  note?: string;
  actor: Actor;
}

/**
 * Applique un mouvement de stock de façon atomique et l'inscrit au journal.
 * Doit être appelé dans une transaction (session obligatoire).
 */
export async function applyMovement(session: ClientSession, a: MoveArgs) {
  const product = oid(a.productId);
  const depot = oid(a.depotId);
  const lot = a.lot.trim().toUpperCase();
  const reservedDelta = a.reservedDelta ?? 0;

  const filter: Record<string, unknown> = { product, depot, lot };
  const conditions: unknown[] = [];
  if (a.delta < 0) {
    // Le stock physique ne peut pas devenir négatif.
    conditions.push({ $gte: ["$onHandBoxes", -a.delta] });
  }
  if (a.checkAvailable && a.delta < 0) {
    conditions.push({ $gte: [{ $subtract: ["$onHandBoxes", "$reservedBoxes"] }, -a.delta] });
  }
  if (reservedDelta < 0) {
    conditions.push({ $gte: ["$reservedBoxes", -reservedDelta] });
  }
  if (reservedDelta > 0) {
    // On ne peut réserver que des caisses disponibles.
    conditions.push({ $gte: [{ $subtract: ["$onHandBoxes", "$reservedBoxes"] }, reservedDelta] });
  }
  if (conditions.length) filter.$expr = { $and: conditions };

  const inc: Record<string, number> = {};
  if (a.delta) inc.onHandBoxes = a.delta;
  if (reservedDelta) inc.reservedBoxes = reservedDelta;

  const updated = await StockLot.findOneAndUpdate(
    filter,
    { $inc: inc },
    // Une entrée peut créer le lot s'il n'existe pas encore dans ce dépôt.
    { session, returnDocument: "after", upsert: a.delta > 0 && reservedDelta >= 0 },
  );

  if (!updated) {
    const existing = await StockLot.findOne({ product, depot, lot }).session(session);
    const p = await Product.findById(product).session(session).select("name");
    const label = `${p?.name ?? "Article"} — bain ${lot}`;
    if (!existing) throw new AppError(`${label} : aucun stock dans ce dépôt.`, 409);
    const available = existing.onHandBoxes - existing.reservedBoxes;
    throw new AppError(
      `${label} : stock insuffisant (${available} caisse(s) disponible(s), ${existing.reservedBoxes} réservée(s) en transfert).`,
      409,
    );
  }

  if (a.delta !== 0) {
    await StockMovement.create(
      [
        {
          type: a.type,
          product,
          depot,
          lot,
          deltaBoxes: a.delta,
          balanceAfter: updated.onHandBoxes,
          refType: a.refType ?? "Manual",
          refId: a.refId,
          refNumber: a.refNumber ?? "",
          note: a.note ?? "",
          createdBy: a.actor.id,
          createdByName: a.actor.name,
        },
      ],
      { session },
    );
  }
  return updated;
}

/** Entrée fournisseur, ajustement d'inventaire ou casse en dépôt. */
export async function recordStockOperation(input: StockEntryInput, actor: Actor) {
  await connectDB();
  const [depot, product] = await Promise.all([
    Depot.findById(input.depotId),
    Product.findById(input.productId),
  ]);
  if (!depot) throw new AppError("Dépôt introuvable", 404);
  if (!product) throw new AppError("Produit introuvable", 404);
  assertCanWriteDepot(actor, depot._id, depot.name, "modifier le stock");

  let delta = input.quantityBoxes;
  if (input.type === "ENTREE") delta = Math.abs(delta);
  if (input.type === "CASSE") delta = -Math.abs(delta);

  const lot = await withTransaction((session) =>
    applyMovement(session, {
      type: input.type,
      productId: product._id,
      depotId: depot._id,
      lot: input.lot,
      delta,
      // Une casse ou un ajustement négatif ne peut pas toucher aux caisses réservées.
      checkAvailable: true,
      note: input.note,
      actor,
    }),
  );
  broadcast(REALTIME_EVENTS.stock, { depotId: String(depot._id) });
  return lot;
}

export type StockStatus = "RUPTURE" | "BAS" | "OK";

export interface StockRow {
  productId: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  imageUrl: string;
  minStockBoxes: number;
  depotId: string;
  depotCode: string;
  depotName: string;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  incomingBoxes: number;
  status: StockStatus;
  lots: { lot: string; onHandBoxes: number; reservedBoxes: number; availableBoxes: number }[];
}

/**
 * Vue du stock par produit × dépôt, avec le détail des lots,
 * les caisses réservées (départ en transit) et attendues (arrivée en transit).
 */
export async function getStockOverview(depotId?: string): Promise<StockRow[]> {
  await connectDB();
  const depotFilter = depotId ? { _id: oid(depotId) } : { active: true };
  const [products, depots] = await Promise.all([
    Product.find({ active: true }).sort({ motif: 1, name: 1 }).lean(),
    Depot.find(depotFilter).sort({ code: 1 }).lean(),
  ]);
  const depotIds = depots.map((d) => d._id);
  const [lots, incoming] = await Promise.all([
    StockLot.find({ depot: { $in: depotIds } }).lean(),
    Transfer.aggregate<{ _id: { depot: Types.ObjectId; product: Types.ObjectId }; boxes: number }>([
      { $match: { status: "EN_TRANSIT", toDepot: { $in: depotIds } } },
      { $unwind: "$lines" },
      { $group: { _id: { depot: "$toDepot", product: "$lines.product" }, boxes: { $sum: "$lines.sentBoxes" } } },
    ]),
  ]);

  const key = (d: unknown, p: unknown) => `${String(d)}:${String(p)}`;
  const lotMap = new Map<string, typeof lots>();
  for (const l of lots) {
    const k = key(l.depot, l.product);
    if (!lotMap.has(k)) lotMap.set(k, []);
    lotMap.get(k)!.push(l);
  }
  const incomingMap = new Map(incoming.map((i) => [key(i._id.depot, i._id.product), i.boxes]));

  const rows: StockRow[] = [];
  for (const d of depots) {
    for (const p of products) {
      const k = key(d._id, p._id);
      const pl = (lotMap.get(k) ?? []).filter((l) => l.onHandBoxes > 0 || l.reservedBoxes > 0);
      const onHand = pl.reduce((s, l) => s + l.onHandBoxes, 0);
      const reserved = pl.reduce((s, l) => s + l.reservedBoxes, 0);
      const available = onHand - reserved;
      const min = p.minStockBoxes ?? 0;
      rows.push({
        productId: String(p._id),
        ref: p.ref,
        name: p.name,
        motif: p.motif,
        format: p.format,
        m2PerBox: p.m2PerBox,
        pricePerM2: p.pricePerM2,
        imageUrl: p.imageUrl ?? "",
        minStockBoxes: min,
        depotId: String(d._id),
        depotCode: d.code,
        depotName: d.name,
        onHandBoxes: onHand,
        reservedBoxes: reserved,
        availableBoxes: available,
        incomingBoxes: incomingMap.get(k) ?? 0,
        status: available <= 0 ? "RUPTURE" : available <= min ? "BAS" : "OK",
        lots: pl
          .map((l) => ({
            lot: l.lot,
            onHandBoxes: l.onHandBoxes,
            reservedBoxes: l.reservedBoxes,
            availableBoxes: l.onHandBoxes - l.reservedBoxes,
          }))
          .sort((a, b) => b.availableBoxes - a.availableBoxes),
      });
    }
  }
  return rows;
}

/**
 * Statut d'un produit sur l'ensemble du réseau (seuil global + minimum par dépôt) :
 *  - RUPTURE      : plus aucune caisse disponible nulle part ;
 *  - BAS          : total disponible sous le seuil global → commander au fournisseur ;
 *  - REEQUILIBRER : total suffisant mais au moins un dépôt sous son minimum → un transfert suffit ;
 *  - OK.
 */
export type GlobalStatus = "RUPTURE" | "BAS" | "REEQUILIBRER" | "OK";

export interface ProductStock {
  productId: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  imageUrl: string;
  minDepotBoxes: number;
  globalMinBoxes: number;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  incomingBoxes: number;
  status: GlobalStatus;
  depots: Pick<StockRow, "depotId" | "depotCode" | "depotName" | "onHandBoxes" | "reservedBoxes" | "availableBoxes" | "incomingBoxes" | "status" | "lots">[];
}

const STATUS_ORDER: Record<GlobalStatus, number> = { RUPTURE: 0, BAS: 1, REEQUILIBRER: 2, OK: 3 };

/** Stock par produit, tous dépôts actifs confondus, avec la répartition par dépôt et par bain. */
export async function getProductOverview(): Promise<ProductStock[]> {
  const [rows, globalMins] = await Promise.all([
    getStockOverview(),
    Product.find({ active: true }, { globalMinBoxes: 1 }).lean(),
  ]);
  const globalById = new Map(globalMins.map((p) => [String(p._id), p.globalMinBoxes]));
  const byProduct = new Map<string, StockRow[]>();
  for (const r of rows) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
    byProduct.get(r.productId)!.push(r);
  }

  const out: ProductStock[] = [];
  for (const [productId, list] of byProduct) {
    const p = list[0];
    const sum = (k: "onHandBoxes" | "reservedBoxes" | "availableBoxes" | "incomingBoxes") => list.reduce((s, r) => s + r[k], 0);
    const available = sum("availableBoxes");
    const globalMin = globalById.get(productId) ?? p.minStockBoxes * list.length;
    const status: GlobalStatus =
      available <= 0 ? "RUPTURE" : available <= globalMin ? "BAS" : list.some((r) => r.status !== "OK") ? "REEQUILIBRER" : "OK";
    out.push({
      productId,
      ref: p.ref,
      name: p.name,
      motif: p.motif,
      format: p.format,
      m2PerBox: p.m2PerBox,
      pricePerM2: p.pricePerM2,
      imageUrl: p.imageUrl,
      minDepotBoxes: p.minStockBoxes,
      globalMinBoxes: globalMin,
      onHandBoxes: sum("onHandBoxes"),
      reservedBoxes: sum("reservedBoxes"),
      availableBoxes: available,
      incomingBoxes: sum("incomingBoxes"),
      status,
      depots: list.map(({ depotId, depotCode, depotName, onHandBoxes, reservedBoxes, availableBoxes, incomingBoxes, status, lots }) => ({
        depotId,
        depotCode,
        depotName,
        onHandBoxes,
        reservedBoxes,
        availableBoxes,
        incomingBoxes,
        status,
        lots,
      })),
    });
  }
  return out.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.availableBoxes - b.availableBoxes);
}

/** Lots vendables d'un dépôt (pour la facturation et les transferts). */
export async function getAvailableLots(depotId: string) {
  await connectDB();
  const lots = await StockLot.find({ depot: oid(depotId) }).lean();
  return lots
    .map((l) => ({
      productId: String(l.product),
      lot: l.lot,
      onHandBoxes: l.onHandBoxes,
      reservedBoxes: l.reservedBoxes,
      availableBoxes: l.onHandBoxes - l.reservedBoxes,
    }))
    .filter((l) => l.availableBoxes > 0)
    .sort((a, b) => b.availableBoxes - a.availableBoxes);
}

export async function listMovements(opts: { depotId?: string; productId?: string; limit?: number }) {
  await connectDB();
  const q: Record<string, unknown> = {};
  if (opts.depotId) q.depot = oid(opts.depotId);
  if (opts.productId) q.product = oid(opts.productId);
  return StockMovement.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(opts.limit ?? 100, 500))
    .populate("product", "ref name motif m2PerBox")
    .populate("depot", "code name")
    .lean();
}
