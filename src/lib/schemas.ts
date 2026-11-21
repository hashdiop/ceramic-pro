import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "identifiant invalide");
const boxes = z.coerce.number().int("nombre de caisses entier").positive("doit être supérieur à 0");
const lot = z.string().trim().min(1, "numéro de bain requis").max(40).toUpperCase();

export const CLIENT_TYPES = ["Particulier", "Carreleur / Artisan", "Entreprise BTP"] as const;
export const PAYMENT_METHODS = ["Wave", "Orange Money", "Espèces", "Virement Bancaire", "Chèque"] as const;

export const invoiceInputSchema = z.object({
  depotId: objectId,
  client: z.object({
    name: z.string().trim().max(120).default(""),
    phone: z.string().trim().max(40).default(""),
    type: z.enum(CLIENT_TYPES).default("Particulier"),
  }),
  paymentMethod: z.enum(PAYMENT_METHODS),
  lines: z
    .array(
      z.object({
        productId: objectId,
        requestedM2: z.coerce.number().positive("surface demandée > 0").max(100000),
        lot: z.string().trim().toUpperCase().optional(),
      }),
    )
    .min(1, "ajoutez au moins un article"),
  breakage: z
    .object({
      productId: objectId,
      unit: z.enum(["caisses", "m2"]),
      quantity: z.coerce.number().positive("quantité cassée > 0"),
    })
    .nullable()
    .optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const stockEntrySchema = z.object({
  type: z.enum(["ENTREE", "AJUSTEMENT", "CASSE"]),
  depotId: objectId,
  productId: objectId,
  lot,
  /** ENTREE / CASSE : quantité positive. AJUSTEMENT : variation signée. */
  quantityBoxes: z.coerce.number().int().refine((n) => n !== 0, "quantité non nulle"),
  note: z.string().trim().max(300).default(""),
});
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

export const transferInputSchema = z
  .object({
    fromDepotId: objectId,
    toDepotId: objectId,
    driver: z.string().trim().max(80).default(""),
    vehicle: z.string().trim().max(40).default(""),
    note: z.string().trim().max(300).default(""),
    lines: z
      .array(z.object({ productId: objectId, lot, boxes }))
      .min(1, "ajoutez au moins un article"),
  })
  .refine((v) => v.fromDepotId !== v.toDepotId, {
    message: "le dépôt destinataire doit être différent du dépôt source",
    path: ["toDepotId"],
  });
export type TransferInput = z.infer<typeof transferInputSchema>;

export const transferReceptionSchema = z.object({
  receivedBy: z.string().trim().max(80).default(""),
  receptionNote: z.string().trim().max(300).default(""),
  lines: z
    .array(
      z.object({
        lineId: objectId,
        receivedBoxes: z.coerce.number().int().min(0),
        note: z.string().trim().max(200).default(""),
      }),
    )
    .min(1),
});
export type TransferReceptionInput = z.infer<typeof transferReceptionSchema>;

export const productInputSchema = z.object({
  ref: z.string().trim().min(1).max(30).toUpperCase(),
  name: z.string().trim().min(1).max(120),
  motif: z.string().trim().min(1).max(60),
  format: z.string().trim().min(1).max(30),
  m2PerBox: z.coerce.number().positive().max(100),
  pricePerM2: z.coerce.number().int().min(0),
  minStockBoxes: z.coerce.number().int().min(0).default(10),
  imageUrl: z.string().trim().default(""),
  imagePublicId: z.string().trim().default(""),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const depotInputSchema = z.object({
  code: z.string().trim().min(1).max(10).toUpperCase(),
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
});
export type DepotInput = z.infer<typeof depotInputSchema>;
