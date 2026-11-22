import { Types } from "mongoose";
import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Product, StockLot, Transfer } from "@/server/models";
import type { DepotInput, DepotUpdate, ProductInput, ProductUpdate } from "@/lib/schemas";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";
import { assertOwnedPublicId, deleteImage, deleteImageQuietly, isCloudinaryEnabled, isOwnedPublicId, moveImage } from "@/server/cloudinary";
import { nextProductRef } from "./numbering";

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

/** Une image Cloudinary doit venir de nos dossiers, et son URL correspondre à son identifiant. */
function checkImage(imageUrl: string | undefined, imagePublicId: string | undefined) {
  if (!imagePublicId) return;
  assertOwnedPublicId(imagePublicId);
  if (!imageUrl?.includes(`/${imagePublicId}`)) throw new AppError("Image incohérente : renvoyez la photo.", 400);
}

export async function createProduct(input: ProductInput) {
  await connectDB();
  checkImage(input.imageUrl, input.imagePublicId);
  // Référence attribuée automatiquement ; nouvel essai si deux créations simultanées se croisent.
  for (let attempt = 0; ; attempt++) {
    try {
      const p = await Product.create({ ...input, ref: await nextProductRef() });
      changed();
      return p;
    } catch (err) {
      const duplicate = err && typeof err === "object" && "code" in err && err.code === 11000;
      if (!duplicate || attempt >= 2) throw err;
    }
  }
}

/** Supprime une image envoyée mais jamais enregistrée sur un produit (formulaire abandonné). */
export async function discardUnusedImage(publicId: string) {
  await connectDB();
  assertOwnedPublicId(publicId);
  if (await Product.exists({ imagePublicId: publicId })) throw new AppError("Image utilisée par un produit.", 409);
  await deleteImage(publicId);
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

  const imageChanged = input.imagePublicId !== undefined && input.imagePublicId !== current.imagePublicId;
  if (imageChanged) checkImage(input.imageUrl, input.imagePublicId);
  const archiving = input.active === false && current.active;
  const reactivating = input.active === true && !current.active;

  if (archiving) {
    const usage = await productStockUsage(current._id);
    if (usage.onHand > 0 || usage.inTransit > 0) {
      throw new AppError(
        `Impossible d'archiver ${current.name} : ${usage.onHand} caisse(s) encore en stock${usage.inTransit ? ` et ${usage.inTransit} transfert(s) en transit` : ""}. Videz le stock (vente, transfert ou ajustement) avant d'archiver.`,
        409,
      );
    }
  }

  const previousImage = current.imagePublicId;
  current.set(input);

  // Archivage / réactivation : l'image Cloudinary suit le produit (archives ⇄ products).
  let moved: { from: string; to: string } | null = null;
  const imageToMove = current.imagePublicId;
  if ((archiving || reactivating) && imageToMove && isOwnedPublicId(imageToMove) && isCloudinaryEnabled()) {
    const inArchives = imageToMove.includes("/archives/");
    if (archiving !== inArchives) {
      const res = await moveImage(imageToMove, archiving);
      current.set({ imageUrl: res.url, imagePublicId: res.publicId });
      moved = { from: imageToMove, to: res.publicId };
    }
  }

  try {
    await current.save();
  } catch (err) {
    // Enregistrement refusé : on remet l'image à sa place pour rester cohérent.
    if (moved) await moveImage(moved.to, !archiving).catch((e) => console.error("[cloudinary] retour impossible", e));
    throw err;
  }

  // Image remplacée ou retirée : l'ancienne n'est plus référencée, on la supprime.
  if (imageChanged && previousImage && previousImage !== current.imagePublicId) await deleteImageQuietly(previousImage);

  changed();
  return current;
}

/* -------------------------------------------------------------------------- */
/*  Dépôts                                                                  */
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
