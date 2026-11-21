import { amountFor, boxesForM2, fromCm2, m2ForBoxes, toCm2 } from "./units";

/**
 * Calcul d'une facture — fonction pure, utilisée à l'identique par l'aperçu
 * (navigateur) et par l'enregistrement (serveur, qui fait foi).
 */
export interface CalcProduct {
  id: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
}

export interface CalcLineInput {
  product: CalcProduct;
  requestedM2: number;
  lot?: string;
}

export interface CalcBreakageInput {
  product: CalcProduct;
  unit: "caisses" | "m2";
  quantity: number;
}

export interface CalcLine extends CalcLineInput {
  boxes: number;
  billedM2: number;
  lineTotal: number;
}

export interface CalcResult {
  lines: CalcLine[];
  totalM2: number;
  subtotal: number;
  breakage: (CalcBreakageInput & { m2: number; amount: number }) | null;
  breakageAmount: number;
  netTotal: number;
  /** Message bloquant (ex. casse supérieure au montant de la facture). */
  error: string | null;
}

export function computeInvoice(lines: CalcLineInput[], breakage?: CalcBreakageInput | null): CalcResult {
  let subtotal = 0;
  let totalCenti = 0;

  const computed = lines.map((l) => {
    const boxes = boxesForM2(l.requestedM2, l.product.m2PerBox);
    const billedM2 = m2ForBoxes(boxes, l.product.m2PerBox);
    const lineTotal = amountFor(billedM2, l.product.pricePerM2);
    subtotal += lineTotal;
    totalCenti += toCm2(billedM2);
    return { ...l, boxes, billedM2, lineTotal };
  });

  let b: CalcResult["breakage"] = null;
  if (breakage && breakage.quantity > 0) {
    const m2 =
      breakage.unit === "caisses"
        ? m2ForBoxes(breakage.quantity, breakage.product.m2PerBox)
        : fromCm2(toCm2(breakage.quantity));
    b = { ...breakage, m2, amount: amountFor(m2, breakage.product.pricePerM2) };
  }
  const breakageAmount = b?.amount ?? 0;

  let error: string | null = null;
  if (computed.length === 0) error = "Ajoutez au moins un article.";
  else if (breakageAmount > subtotal)
    error = "Le report de casse dépasse le montant de la marchandise.";

  return {
    lines: computed,
    totalM2: fromCm2(totalCenti),
    subtotal,
    breakage: b,
    breakageAmount,
    netTotal: Math.max(0, subtotal - breakageAmount),
    error,
  };
}
