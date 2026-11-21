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
