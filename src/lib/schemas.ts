import { z } from "zod";

// Messages de validation en français.
z.config(z.locales.fr());

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

/* Champs sans valeur par défaut : réutilisés tels quels pour les mises à jour partielles
   (avec Zod 4, .partial() appliquerait sinon les valeurs par défaut et écraserait les données). */
const productFields = z.object({
  ref: z.string().trim().min(1, "référence requise").max(30).toUpperCase(),
  name: z.string().trim().min(1, "désignation requise").max(120),
  motif: z.string().trim().min(1, "motif requis").max(60),
  format: z.string().trim().min(1, "format requis").max(30),
  m2PerBox: z.coerce.number().positive("m² par caisse > 0").max(100),
  pricePerM2: z.coerce.number().int("prix entier en FCFA").min(0),
  minStockBoxes: z.coerce.number().int().min(0),
  imageUrl: z.string().trim().max(500),
  imagePublicId: z.string().trim().max(200),
  active: z.boolean(),
});

export const productInputSchema = productFields.extend({
  minStockBoxes: productFields.shape.minStockBoxes.default(10),
  imageUrl: productFields.shape.imageUrl.default(""),
  imagePublicId: productFields.shape.imagePublicId.default(""),
  active: productFields.shape.active.default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const productUpdateSchema = productFields.partial();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

const depotFields = z.object({
  code: z.string().trim().min(1, "code requis").max(10).toUpperCase(),
  name: z.string().trim().min(1, "nom requis").max(80),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  active: z.boolean(),
});

export const depotInputSchema = depotFields.extend({
  address: depotFields.shape.address.default(""),
  phone: depotFields.shape.phone.default(""),
  active: depotFields.shape.active.default(true),
});
export type DepotInput = z.infer<typeof depotInputSchema>;

export const depotUpdateSchema = depotFields.partial();
export type DepotUpdate = z.infer<typeof depotUpdateSchema>;
