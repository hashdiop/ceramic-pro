import { Types } from "mongoose";
import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Product, StockLot, Transfer } from "@/server/models";
import type { DepotInput, DepotUpdate, ProductInput, ProductUpdate } from "@/lib/schemas";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";

const changed = () => {
  broadcast(REALTIME_EVENTS.catalog);
  broadcast(REALTIME_EVENTS.stock);
};

/* -------------------------------------------------------------------------- */
/*  Produits                                                                  */
/* -------------------------------------------------------------------------- */

export async function listProducts(opts: { includeInactive?: boolean } = {}) {
  await connectDB();
  return Product.find(opts.includeInactive ? {} : { active: true })
    .sort({ active: -1, motif: 1, name: 1 })
    .lean();
}

export async function createProduct(input: ProductInput) {
  await connectDB();
  if (await Product.exists({ ref: input.ref })) throw new AppError(`La référence ${input.ref} existe déjà.`, 409);
  const p = await Product.create(input);
  changed();
  return p;
}

/** Caisses encore présentes ou en route pour un produit (bloque l'archivage). */
async function productStockUsage(productId: Types.ObjectId) {
  const [onHand, inTransit] = await Promise.all([
    StockLot.aggregate<{ boxes: number }>([
      { $match: { product: productId } },
      { $group: { _id: null, boxes: { $sum: "$onHandBoxes" } } },
    ]),
    Transfer.countDocuments({ status: "EN_TRANSIT", "lines.product": productId }),
  ]);
  return { onHand: onHand[0]?.boxes ?? 0, inTransit };
}

export async function updateProduct(id: string, input: ProductUpdate) {
  await connectDB();
  const current = await Product.findById(id);
  if (!current) throw new AppError("Produit introuvable", 404);

  if (input.ref && input.ref !== current.ref && (await Product.exists({ ref: input.ref, _id: { $ne: current._id } }))) {
    throw new AppError(`La référence ${input.ref} existe déjà.`, 409);
  }
  if (input.active === false && current.active) {
    const usage = await productStockUsage(current._id);
    if (usage.onHand > 0 || usage.inTransit > 0) {
      throw new AppError(
        `Impossible d'archiver ${current.name} : ${usage.onHand} caisse(s) encore en stock${usage.inTransit ? ` et ${usage.inTransit} transfert(s) en transit` : ""}. Videz le stock (vente, transfert ou ajustement) avant d'archiver.`,
        409,
      );
    }
  }

  current.set(input);
  await current.save();
  changed();
  return current;
}

/* -------------------------------------------------------------------------- */
/*  Dépôts                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDepots(opts: { includeInactive?: boolean } = {}) {
  await connectDB();
  return Depot.find(opts.includeInactive ? {} : { active: true })
    .sort({ active: -1, code: 1 })
    .lean();
}

export async function createDepot(input: DepotInput) {
  await connectDB();
  if (await Depot.exists({ code: input.code })) throw new AppError(`Le code dépôt ${input.code} existe déjà.`, 409);
  const d = await Depot.create(input);
  changed();
  return d;
}

export async function updateDepot(id: string, input: DepotUpdate) {
  await connectDB();
  const current = await Depot.findById(id);
  if (!current) throw new AppError("Dépôt introuvable", 404);

  if (input.code && input.code !== current.code && (await Depot.exists({ code: input.code, _id: { $ne: current._id } }))) {
    throw new AppError(`Le code dépôt ${input.code} existe déjà.`, 409);
  }
  if (input.active === false && current.active) {
    const [stock, transit, activeCount] = await Promise.all([
      StockLot.aggregate<{ boxes: number }>([
        { $match: { depot: current._id } },
        { $group: { _id: null, boxes: { $sum: "$onHandBoxes" } } },
      ]),
      Transfer.countDocuments({ status: "EN_TRANSIT", $or: [{ fromDepot: current._id }, { toDepot: current._id }] }),
      Depot.countDocuments({ active: true }),
    ]);
    const boxes = stock[0]?.boxes ?? 0;
    if (activeCount <= 1) throw new AppError("Impossible d'archiver le dernier dépôt actif.", 409);
    if (boxes > 0 || transit > 0) {
      throw new AppError(
        `Impossible d'archiver ${current.name} : ${boxes} caisse(s) en stock${transit ? ` et ${transit} transfert(s) en transit` : ""}. Transférez ou soldez le stock d'abord.`,
        409,
      );
    }
  }

  current.set(input);
  await current.save();
  changed();
  return current;
}
