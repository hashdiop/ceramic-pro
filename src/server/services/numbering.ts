import type { ClientSession } from "mongoose";
import { Counter, Product } from "@/server/models";

/**
 * Numéro séquentiel atomique : FAC-2026-0001, TRF-2026-0001…
 * Le compteur repart à 1 chaque année.
 */
export async function nextNumber(prefix: "FAC" | "TRF", session?: ClientSession): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  return `${key}-${String(counter!.seq).padStart(4, "0")}`;
}

/**
 * Prochaine référence produit : REF-000001, REF-000002…
 * Le compteur démarre au-dessus de la plus grande référence REF-<nombre> déjà en base
 * (les produits existants, ex. REF-1 ou REF-08, gardent leur référence).
 */
export async function nextProductRef(): Promise<string> {
  const [max] = await Product.aggregate<{ n: number }>([
    { $match: { ref: { $regex: /^REF-\d+$/ } } },
    { $project: { n: { $toInt: { $substrCP: ["$ref", 4, 20] } } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  await Counter.updateOne({ _id: "REF" }, { $max: { seq: max?.n ?? 0 } }, { upsert: true });
  const counter = await Counter.findOneAndUpdate({ _id: "REF" }, { $inc: { seq: 1 } }, { returnDocument: "after" });
  return `REF-${String(counter!.seq).padStart(6, "0")}`;
}
