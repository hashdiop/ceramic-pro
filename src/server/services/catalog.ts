import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, Product } from "@/server/models";
import type { DepotInput, ProductInput } from "@/lib/schemas";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { broadcast } from "@/server/realtime";

export async function listProducts() {
  await connectDB();
  return Product.find({ active: true }).sort({ motif: 1, name: 1 }).lean();
}

export async function createProduct(input: ProductInput) {
  await connectDB();
  if (await Product.exists({ ref: input.ref })) throw new AppError(`La référence ${input.ref} existe déjà.`, 409);
  const p = await Product.create(input);
  broadcast(REALTIME_EVENTS.catalog);
  return p;
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  await connectDB();
  const p = await Product.findByIdAndUpdate(id, input, { returnDocument: "after", runValidators: true });
  if (!p) throw new AppError("Produit introuvable", 404);
  broadcast(REALTIME_EVENTS.catalog);
  return p;
}

export async function listDepots() {
  await connectDB();
  return Depot.find({ active: true }).sort({ code: 1 }).lean();
}

export async function createDepot(input: DepotInput) {
  await connectDB();
  if (await Depot.exists({ code: input.code })) throw new AppError(`Le code dépôt ${input.code} existe déjà.`, 409);
  const d = await Depot.create(input);
  broadcast(REALTIME_EVENTS.catalog);
  return d;
}
