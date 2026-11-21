import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Erreur métier renvoyée telle quelle à l'utilisateur. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Libellés lisibles des champs, pour les messages de validation. */
const FIELD_LABELS: Record<string, string> = {
  ref: "Référence",
  name: "Nom",
  motif: "Motif",
  format: "Format",
  m2PerBox: "m² par caisse",
  pricePerM2: "Prix au m²",
  minStockBoxes: "Seuil d'alerte",
  imageUrl: "URL de l'image",
  code: "Code",
  address: "Adresse",
  phone: "Téléphone",
  lot: "Bain",
  boxes: "Caisses",
  quantityBoxes: "Quantité",
  requestedM2: "Surface demandée",
  depotId: "Dépôt",
  productId: "Article",
  toDepotId: "Dépôt destinataire",
  fromDepotId: "Dépôt expéditeur",
  receivedBoxes: "Caisses reçues",
  lines: "Articles",
};

const fieldLabel = (path: PropertyKey[]) => {
  const last = [...path].reverse().find((p) => typeof p === "string") as string | undefined;
  return last ? (FIELD_LABELS[last] ?? last) : "Données";
};

/** Convertit une erreur en réponse JSON lisible par l'interface. */
export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: first ? `${fieldLabel(first.path)} : ${first.message}` : "Données invalides", issues: err.issues },
      { status: 422 },
    );
  }
  if (err && typeof err === "object" && "name" in err && err.name === "CastError") {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  console.error(err);
  if (err && typeof err === "object" && "name" in err && /^Mongo(Network|ServerSelection|NetworkTimeout)/.test(String(err.name))) {
    return NextResponse.json(
      { error: "Base de données momentanément injoignable. Vérifiez la connexion Internet puis réessayez." },
      { status: 503 },
    );
  }
  const message = err instanceof Error ? err.message : "Erreur serveur";
  return NextResponse.json({ error: message }, { status: 500 });
}
