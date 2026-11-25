import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { BSON } from "mongodb";

/**
 * Format de sauvegarde « .cpb » (CéramiquePro Backup), version 1 :
 *
 *   "CPB1" | longueur de l'en-tête (4 octets) | en-tête JSON en clair | iv (12) | tag (16) | données chiffrées
 *
 * - L'en-tête (date, type, auteur, nombres d'éléments, empreintes) reste lisible sans la clé :
 *   on peut lister et décrire une sauvegarde sans la déchiffrer.
 * - Les données sont du JSON étendu (EJSON : conserve ObjectId et dates), compressé (gzip),
 *   puis chiffré en AES-256-GCM avec une clé dérivée de BACKUP_KEY. GCM authentifie aussi l'en-tête :
 *   un fichier modifié, tronqué ou ouvert avec une autre clé est refusé.
 */
export const FORMAT_VERSION = 1;
const MAGIC = Buffer.from("CPB1");

export type BackupKind = "MANUELLE" | "AVANT_RESTAURATION" | "AUTO";

export interface BackupManifest {
  format: number;
  app: "ceramique-pro";
  createdAt: string; // ISO
  kind: BackupKind;
  by: string; // auteur
  note: string;
  database: string;
  counts: Record<string, number>;
  /** Empreinte du contenu métier (hors dates de connexion) : sert à refuser les doublons. */
  contentHash: string;
  /** Empreinte exacte des données sauvegardées : vérifiée à la restauration. */
  dataHash: string;
}

export type BackupData = Record<string, Record<string, unknown>[]>;

const keyFrom = (secret: string) => createHash("sha256").update(secret).digest();
export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** Champs qui changent sans que les données métier changent (une simple connexion). */
const VOLATILE: Record<string, string[]> = { users: ["lastLoginAt", "updatedAt"] };

export function contentHash(data: BackupData) {
  const h = createHash("sha256");
  for (const name of Object.keys(data).sort()) {
    const skip = VOLATILE[name] ?? [];
    h.update(name);
    for (const doc of data[name]) {
      const clean = skip.length ? Object.fromEntries(Object.entries(doc).filter(([k]) => !skip.includes(k))) : doc;
      h.update(BSON.EJSON.stringify(clean, { relaxed: false }));
    }
  }
  return h.digest("hex");
}

export function encodeBackup(manifest: Omit<BackupManifest, "dataHash" | "format" | "app">, data: BackupData, secret: string) {
  const plain = Buffer.from(BSON.EJSON.stringify(data, { relaxed: false }));
  const full: BackupManifest = { format: FORMAT_VERSION, app: "ceramique-pro", ...manifest, dataHash: sha256(plain) };
  const header = Buffer.from(JSON.stringify(full));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  cipher.setAAD(header); // l'en-tête est authentifié : impossible de le falsifier
  const body = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return { file: Buffer.concat([MAGIC, len, header, iv, cipher.getAuthTag(), body]), manifest: full };
}

/** Lit l'en-tête seul (sans clé). */
export function readManifest(file: Buffer): BackupManifest {
  if (file.length < 8 || !file.subarray(0, 4).equals(MAGIC)) throw new Error("Ce fichier n'est pas une sauvegarde CéramiquePro.");
  const len = file.readUInt32BE(4);
  const m = JSON.parse(file.subarray(8, 8 + len).toString()) as BackupManifest;
  if (m.app !== "ceramique-pro") throw new Error("Sauvegarde d'une autre application.");
  if (m.format > FORMAT_VERSION) throw new Error(`Format de sauvegarde v${m.format} trop récent pour cette version de l'application.`);
  return m;
}

export function decodeBackup(file: Buffer, secret: string): { manifest: BackupManifest; data: BackupData } {
  const manifest = readManifest(file);
  const len = file.readUInt32BE(4);
  const header = file.subarray(8, 8 + len);
  const iv = file.subarray(8 + len, 20 + len);
  const tag = file.subarray(20 + len, 36 + len);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  let plain: Buffer;
  try {
    plain = gunzipSync(Buffer.concat([decipher.update(file.subarray(36 + len)), decipher.final()]));
  } catch {
    throw new Error("Impossible de déchiffrer : mauvaise BACKUP_KEY, ou fichier modifié / incomplet.");
  }
  if (sha256(plain) !== manifest.dataHash) throw new Error("Empreinte invalide : le contenu de la sauvegarde est altéré.");
  return { manifest, data: BSON.EJSON.parse(plain.toString(), { relaxed: false }) as BackupData };
}
