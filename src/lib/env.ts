/**
 * Accès centralisé aux variables d'environnement côté serveur.
 * Ne jamais importer ce fichier depuis un composant client.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env.local et renseignez-la.`,
    );
  }
  return value;
}

export const env = {
  get mongodbUri() {
    return required("MONGODB_URI");
  },
  get mongodbDb() {
    return process.env.MONGODB_DB || "ceramique-pro";
  },
  /**
   * Mode démo (maquette) : boutons de connexion rapide aux comptes de démonstration, sans mot de passe.
   * À ne JAMAIS activer avec de vraies données : quiconque a le lien devient administrateur.
   */
  get demoLogin() {
    return process.env.DEMO_LOGIN === "true";
  },
  /** Clé de chiffrement des sauvegardes (32 caractères minimum). Sans elle, impossible de sauvegarder ou restaurer. */
  get backupKey() {
    const v = process.env.BACKUP_KEY;
    if (!v || v.length < 32) throw new Error("BACKUP_KEY manquant ou trop court (32 caractères minimum).");
    return v;
  },
  get backupConfigured() {
    return Boolean(process.env.BACKUP_KEY && process.env.BACKUP_KEY.length >= 32);
  },
  /** Clé de signature des sessions. Obligatoire en production ; valeur de secours en développement. */
  get authSecret() {
    const v = process.env.AUTH_SECRET;
    if (v && v.length >= 32) return v;
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum). Ajoutez-le aux variables d'environnement.");
    }
    return "dev-only-secret-ceramique-pro-ne-pas-utiliser-en-prod";
  },
  cloudinary: {
    get cloudName() {
      return process.env.CLOUDINARY_CLOUD_NAME || "";
    },
    get apiKey() {
      return process.env.CLOUDINARY_API_KEY || "";
    },
    get apiSecret() {
      return process.env.CLOUDINARY_API_SECRET || "";
    },
    get folder() {
      return process.env.CLOUDINARY_FOLDER || "ceramique-pro";
    },
    get enabled() {
      return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET,
      );
    },
  },
};
