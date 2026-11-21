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

/** Convertit une erreur en réponse JSON lisible par l'interface. */
export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".") || "Données"} : ${first.message}` : "Données invalides", issues: err.issues },
      { status: 422 },
    );
  }
  if (err && typeof err === "object" && "name" in err && err.name === "CastError") {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Erreur serveur";
  return NextResponse.json({ error: message }, { status: 500 });
}
