/**
 * Calculs métier sur les surfaces et les caisses.
 *
 * Les surfaces sont manipulées en cm² (entiers, 1 m² = 10 000 cm²) pour éviter
 * les erreurs d'arrondi des nombres flottants (ex. 4.32 / 1.44 = 3.0000000000000004).
 */

/** Convertit des m² en cm² entiers. */
export const toCm2 = (m2: number): number => Math.round(m2 * 10000);

/** Convertit des cm² en m². */
export const fromCm2 = (c: number): number => c / 10000;

/** Nombre de caisses entières nécessaires pour couvrir une surface demandée. */
export function boxesForM2(requestedM2: number, m2PerBox: number): number {
  const req = toCm2(requestedM2);
  const perBox = toCm2(m2PerBox);
  if (req <= 0 || perBox <= 0) return 0;
  return Math.ceil(req / perBox);
}

/** Surface (m²) correspondant à un nombre de caisses. */
export function m2ForBoxes(boxes: number, m2PerBox: number): number {
  return fromCm2(boxes * toCm2(m2PerBox));
}

/** Montant FCFA arrondi à l'unité pour une surface et un prix au m². */
export function amountFor(m2: number, pricePerM2: number): number {
  return Math.round((toCm2(m2) * pricePerM2) / 10000);
}

export const formatCFA = (n: number): string =>
  `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

export const formatM2 = (n: number): string =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export const formatDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const formatDateTime = (d: string | Date): string =>
  new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
