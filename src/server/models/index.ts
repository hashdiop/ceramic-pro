import { CLIENT_TYPES, PAYMENT_METHODS } from "@/lib/schemas";
import mongoose, { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/*  Compteur (numérotation séquentielle des factures, transferts…)            */
/* -------------------------------------------------------------------------- */
const counterSchema = new Schema({
  _id: { type: String, required: true }, // ex. "FAC-2026"
  seq: { type: Number, default: 0 },
});
export const Counter: Model<{ _id: string; seq: number }> =
  models.Counter || model("Counter", counterSchema);

/* -------------------------------------------------------------------------- */
/*  Produit (catalogue)                                                       */
/* -------------------------------------------------------------------------- */

const productSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    motif: { type: String, required: true, trim: true },
    format: { type: String, required: true, trim: true }, // "60x60 cm"
    m2PerBox: { type: Number, required: true, min: 0.01 },
    pricePerM2: { type: Number, required: true, min: 0 }, // FCFA entiers
    /** Minimum par dépôt (en caisses) : en dessous, le dépôt est signalé (« À rééquilibrer » si le réseau a du stock). */
    minStockBoxes: { type: Number, default: 10, min: 0 },
    /** Seuil d'alerte global (réseau, en caisses). Absent : minimum par dépôt × nombre de dépôts actifs. */
    globalMinBoxes: { type: Number, min: 0 },
    /** URL de l'image (locale pour le jeu d'exemple, Cloudinary ensuite). */
    imageUrl: { type: String, default: "" },
    /** Identifiant Cloudinary, vide tant que Cloudinary n'est pas utilisé. */
    imagePublicId: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId };
export const Product: Model<ProductDoc> = models.Product || model("Product", productSchema);

/* -------------------------------------------------------------------------- */
/*  Dépôt                                                                     */
/* -------------------------------------------------------------------------- */
const depotSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type DepotDoc = InferSchemaType<typeof depotSchema> & { _id: Types.ObjectId };
export const Depot: Model<DepotDoc> = models.Depot || model("Depot", depotSchema);

/* -------------------------------------------------------------------------- */
/*  Stock par produit × dépôt × lot (bain)                                    */
/*  - onHandBoxes   : caisses physiquement présentes au dépôt                 */
/*  - reservedBoxes : caisses engagées dans un transfert non encore reçu      */
/*  - disponible    = onHandBoxes - reservedBoxes                             */
/* -------------------------------------------------------------------------- */
const stockLotSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    depot: { type: Schema.Types.ObjectId, ref: "Depot", required: true },
    lot: { type: String, required: true, trim: true, uppercase: true },
    onHandBoxes: { type: Number, default: 0, min: 0 },
    reservedBoxes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
stockLotSchema.index({ product: 1, depot: 1, lot: 1 }, { unique: true });
stockLotSchema.index({ depot: 1 });
export type StockLotDoc = InferSchemaType<typeof stockLotSchema> & { _id: Types.ObjectId };
export const StockLot: Model<StockLotDoc> = models.StockLot || model("StockLot", stockLotSchema);

/* -------------------------------------------------------------------------- */
/*  Journal des mouvements de stock (traçabilité complète)                    */
/* -------------------------------------------------------------------------- */
export const MOVEMENT_TYPES = [
  "ENTREE", // réception fournisseur
  "VENTE", // sortie par facture
  "TRANSFERT_SORTIE", // validé à la réception : sortie du dépôt source
  "TRANSFERT_ENTREE", // validé à la réception : entrée au dépôt destination
  "ECART_TRANSFERT", // caisses manquantes / cassées pendant le transport
  "CASSE", // casse constatée en dépôt
  "AJUSTEMENT", // correction d'inventaire (+/-)
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

const movementSchema = new Schema(
  {
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    depot: { type: Schema.Types.ObjectId, ref: "Depot", required: true },
    lot: { type: String, required: true },
    /** Variation signée de onHandBoxes (+ entrée, - sortie). */
    deltaBoxes: { type: Number, required: true },
    /** Stock physique après le mouvement. */
    balanceAfter: { type: Number, required: true },
    refType: { type: String, enum: ["Invoice", "Transfer", "Manual"], default: "Manual" },
    refId: { type: Schema.Types.ObjectId },
    refNumber: { type: String, default: "" },
    note: { type: String, default: "" },
    /** Utilisateur à l'origine du mouvement (RBAC à venir). */
    createdBy: { type: String, default: "system" }, // identifiant de l'utilisateur
    createdByName: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ depot: 1, createdAt: -1 });
movementSchema.index({ product: 1, createdAt: -1 });
export type MovementDoc = InferSchemaType<typeof movementSchema> & { _id: Types.ObjectId };
export const StockMovement: Model<MovementDoc> =
  models.StockMovement || model("StockMovement", movementSchema);

/* -------------------------------------------------------------------------- */
/*  Transfert inter-dépôts                                                    */
/*  EN_TRANSIT : les compteurs physiques ne bougent pas, les caisses sont     */
/*               seulement réservées au dépôt source (non vendables).         */
/*  RECU       : validation par le dépôt destinataire → mise à jour des deux  */
/*               dépôts dans une seule transaction.                           */
/* -------------------------------------------------------------------------- */
export const TRANSFER_STATUS = ["EN_TRANSIT", "RECU", "ANNULE"] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];

const transferLineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    ref: String,
    name: String,
    motif: String,
    format: String,
    m2PerBox: Number,
    lot: { type: String, required: true },
    sentBoxes: { type: Number, required: true, min: 1 },
    receivedBoxes: { type: Number, default: null, min: 0 },
    note: { type: String, default: "" },
  },
  { _id: true },
);

const transferSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // TRF-2026-0001
    fromDepot: { type: Schema.Types.ObjectId, ref: "Depot", required: true },
    toDepot: { type: Schema.Types.ObjectId, ref: "Depot", required: true },
    status: { type: String, enum: TRANSFER_STATUS, default: "EN_TRANSIT" },
    lines: { type: [transferLineSchema], validate: (v: unknown[]) => v.length > 0 },
    driver: { type: String, default: "" },
    vehicle: { type: String, default: "" },
    note: { type: String, default: "" },
    createdBy: { type: String, default: "system" }, // identifiant de l'utilisateur
    createdByName: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
    receivedAt: Date,
    receivedBy: String,
    receptionNote: { type: String, default: "" },
    cancelledAt: Date,
    cancelledBy: String,
  },
  { timestamps: true },
);
transferSchema.index({ status: 1, createdAt: -1 });
export type TransferDoc = InferSchemaType<typeof transferSchema> & { _id: Types.ObjectId };
export const Transfer: Model<TransferDoc> = models.Transfer || model("Transfer", transferSchema);

/* -------------------------------------------------------------------------- */
/*  Facture                                                                   */
/* -------------------------------------------------------------------------- */

const invoiceLineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    ref: String,
    name: String,
    motif: String,
    format: String,
    m2PerBox: Number,
    pricePerM2: Number,
    lot: String,
    requestedM2: Number,
    boxes: Number,
    billedM2: Number,
    lineTotal: Number,
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // FAC-2026-0001
    depot: { type: Schema.Types.ObjectId, ref: "Depot", required: true },
    client: {
      name: { type: String, required: true },
      phone: { type: String, default: "" },
      type: { type: String, enum: CLIENT_TYPES, default: "Particulier" },
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    lines: [invoiceLineSchema],
    totalM2: Number,
    subtotal: Number,
    breakage: {
      product: { type: Schema.Types.ObjectId, ref: "Product" },
      name: String,
      unit: { type: String, enum: ["caisses", "m2"] },
      quantity: Number,
      m2: Number,
      amount: Number,
    },
    breakageAmount: { type: Number, default: 0 },
    netTotal: Number,
    createdBy: { type: String, default: "system" }, // identifiant de l'utilisateur
    createdByName: { type: String, default: "" },
  },
  { timestamps: true },
);
invoiceSchema.index({ createdAt: -1 });
export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & { _id: Types.ObjectId };
export const Invoice: Model<InvoiceDoc> = models.Invoice || model("Invoice", invoiceSchema);

export { mongoose };

/* -------------------------------------------------------------------------- */
/*  Utilisateur (RBAC)                                                        */
/* -------------------------------------------------------------------------- */

export const ROLES = ["ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    /** Téléphone personnel du responsable, affiché aux autres dépôts (page Réseau). */
    phone: { type: String, default: "", trim: true },
    /** ADMIN : tous les dépôts + comptes + catalogue. USER : consulte tout, n'agit que sur ses dépôts. */
    role: { type: String, enum: ROLES, default: "USER" },
    depots: [{ type: Schema.Types.ObjectId, ref: "Depot" }],
    passwordHash: { type: String, required: true },
    /** Mot de passe provisoire (par défaut ou réinitialisé) : changement obligatoire à la connexion. */
    mustChangePassword: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    /** Incrémentée pour invalider les sessions ouvertes (mot de passe changé, compte désactivé). */
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
  },
  { timestamps: true },
);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User: Model<UserDoc> = models.User || model("User", userSchema);

/* -------------------------------------------------------------------------- */
/*  État technique et journal des sauvegardes (JAMAIS inclus dans une sauvegarde) */
/* -------------------------------------------------------------------------- */

/** Verrou des opérations de sauvegarde / restauration et drapeau de maintenance. */
const appStateSchema = new Schema({
  _id: { type: String, required: true }, // "backup-lock" | "maintenance"
  at: { type: Date, required: true },
  by: { type: String, default: "" },
  op: { type: String, default: "" },
});
export const AppState: Model<{ _id: string; at: Date; by: string; op: string }> = models.AppState || model("AppState", appStateSchema);

const backupLogSchema = new Schema(
  {
    action: { type: String, enum: ["SAUVEGARDE", "RESTAURATION", "SUPPRESSION"], required: true },
    backupId: { type: String, default: "" },
    by: { type: String, default: "" },
    detail: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const BackupLog = models.BackupLog || model("BackupLog", backupLogSchema);
