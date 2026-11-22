/** Formes JSON renvoyées par l'API (côté client). */

export interface ProductDTO {
  _id: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  minStockBoxes: number;
  globalMinBoxes?: number;
  imageUrl: string;
  imagePublicId?: string;
  active: boolean;
}

export interface DepotDTO {
  _id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  active?: boolean;
}

export type StockStatus = "RUPTURE" | "BAS" | "OK";

export interface LotDTO {
  lot: string;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
}

export interface StockRowDTO {
  productId: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  imageUrl: string;
  minStockBoxes: number;
  depotId: string;
  depotCode: string;
  depotName: string;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  incomingBoxes: number;
  status: StockStatus;
  lots: LotDTO[];
}

export interface AvailableLotDTO extends LotDTO {
  productId: string;
}

export interface MovementDTO {
  _id: string;
  type: string;
  product: { _id: string; ref: string; name: string; motif: string; m2PerBox: number } | null;
  depot: { _id: string; code: string; name: string } | null;
  lot: string;
  deltaBoxes: number;
  balanceAfter: number;
  refType: string;
  refNumber: string;
  note: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export type TransferStatus = "EN_TRANSIT" | "RECU" | "ANNULE";

export interface TransferLineDTO {
  _id: string;
  product: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  lot: string;
  sentBoxes: number;
  receivedBoxes: number | null;
  note: string;
}

export interface TransferDTO {
  _id: string;
  number: string;
  fromDepot: DepotDTO;
  toDepot: DepotDTO;
  status: TransferStatus;
  lines: TransferLineDTO[];
  driver: string;
  vehicle: string;
  note: string;
  createdBy: string;
  sentAt: string;
  receivedAt?: string;
  receivedBy?: string;
  receptionNote?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface InTransitDTO {
  productId: string;
  name: string;
  ref: string;
  m2PerBox: number;
  boxes: number;
  transfers: string[];
  from: string;
  to: string;
}

export interface InvoiceLineDTO {
  product: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  lot: string;
  requestedM2: number;
  boxes: number;
  billedM2: number;
  lineTotal: number;
}

export interface InvoiceDTO {
  _id: string;
  number: string;
  depot: DepotDTO;
  client: { name: string; phone: string; type: string };
  paymentMethod: string;
  lines: InvoiceLineDTO[];
  totalM2: number;
  subtotal: number;
  breakage?: { name: string; unit: "caisses" | "m2"; quantity: number; m2: number; amount: number } | null;
  breakageAmount: number;
  netTotal: number;
  createdAt: string;
}

export interface DashboardDTO {
  revenue: number;
  volume: number;
  breakage: number;
  invoiceCount: number;
  motifs: { motif: string; m2: number; gross: number; breakage: number; net: number }[];
  recent: InvoiceDTO[];
  /** Alertes au niveau du réseau (statut global du produit). */
  alerts: ProductStockDTO[];
  inTransitCount: number;
}

export type Role = "ADMIN" | "USER";

/** Utilisateur connecté (GET /api/auth/me). */
export interface SessionUserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  depotIds: string[];
  mustChangePassword: boolean;
}

/** Compte vu par l'administrateur (GET /api/users). */
export interface UserDTO {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
  depotIds: string[];
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

/** Statut d'un produit sur tout le réseau (seuil global + minimum par dépôt). */
export type GlobalStatus = "RUPTURE" | "BAS" | "REEQUILIBRER" | "OK";

export interface ProductDepotStockDTO {
  depotId: string;
  depotCode: string;
  depotName: string;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  incomingBoxes: number;
  status: StockStatus;
  lots: LotDTO[];
}

/** GET /api/stock/products */
export interface ProductStockDTO {
  productId: string;
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  imageUrl: string;
  minDepotBoxes: number;
  globalMinBoxes: number;
  onHandBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  incomingBoxes: number;
  status: GlobalStatus;
  depots: ProductDepotStockDTO[];
}

/** GET /api/network */
export interface NetworkDepotDTO {
  _id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  managers: { name: string; phone: string }[];
}
