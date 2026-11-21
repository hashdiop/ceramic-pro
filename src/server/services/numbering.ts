import type { ClientSession } from "mongoose";
import { Counter } from "@/server/models";

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
