import { toCm2 } from "./units";

/** "60x60 cm", "20 x 120", "45X90cm", "59,5x59,5" → [60, 60] (en cm). */
export function parseFormat(format: string): [number, number] | null {
  const m = format.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? [w, h] : null;
}

export type TilesPerBox =
  | { kind: "exact"; tiles: number }
  | { kind: "inexact"; approx: number } // format nominal : la division ne tombe pas juste
  | { kind: "unknown" }; // format illisible ou m²/caisse manquant

/**
 * Nombre de carreaux par caisse, déduit des m²/caisse et du format.
 * Information d'affichage uniquement : jamais stockée ni utilisée dans les calculs
 * (prix et stock restent basés sur les m²/caisse du fournisseur).
 * Calcul en mm² entiers pour éviter les erreurs de virgule flottante (1,44 / 0,36 = 4 exactement).
 */
export function tilesPerBox(m2PerBox: number, format: string): TilesPerBox {
  const dims = parseFormat(format);
  if (!dims || !(m2PerBox > 0)) return { kind: "unknown" };
  const boxMm2 = toCm2(m2PerBox) * 100;
  const tileMm2 = Math.round(dims[0] * 10) * Math.round(dims[1] * 10);
  if (boxMm2 % tileMm2 === 0) return { kind: "exact", tiles: boxMm2 / tileMm2 };
  return { kind: "inexact", approx: Math.round((boxMm2 / tileMm2) * 10) / 10 };
}
