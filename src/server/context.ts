import { cookies } from "next/headers";
import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { User, type Role } from "@/server/models";
import { readToken, SESSION_COOKIE } from "@/server/auth/token";

/**
 * Utilisateur courant et règles d'accès (RBAC).
 *
 * Politique :
 *  - tout utilisateur connecté CONSULTE tous les dépôts ;
 *  - un utilisateur n'AGIT (vente, opération de stock, transfert) que sur les dépôts qui lui sont attribués ;
 *  - l'ADMIN agit partout, gère les comptes et le catalogue (produits, dépôts).
 * Toutes les vérifications sont faites ici, côté serveur : l'interface ne fait que les refléter.
 */
export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  depotIds: string[];
  mustChangePassword: boolean;
}

/** Utilisé par les scripts (jeu d'exemple) : droits complets, aucune session. */
export const SYSTEM_ACTOR: Actor = {
  id: "system",
  name: "Système",
  email: "",
  role: "ADMIN",
  depotIds: [],
  mustChangePassword: false,
};

/** Session courante, ou null si personne n'est connecté (jeton absent, expiré, révoqué). */
export async function findActor(): Promise<Actor | null> {
  const payload = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  await connectDB();
  const u = await User.findById(payload.uid).lean();
  if (!u || !u.active || u.tokenVersion !== payload.v) return null;
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    depotIds: (u.depots ?? []).map(String),
    mustChangePassword: Boolean(u.mustChangePassword),
  };
}

/** Utilisateur connecté obligatoire (401 sinon). */
export async function getActor(opts: { allowPendingPassword?: boolean } = {}): Promise<Actor> {
  const actor = await findActor();
  if (!actor) throw new AppError("Session expirée : reconnectez-vous.", 401);
  if (actor.mustChangePassword && !opts.allowPendingPassword) {
    throw new AppError("Changez votre mot de passe provisoire pour continuer.", 403);
  }
  return actor;
}

export const isAdmin = (a: Actor) => a.role === "ADMIN";

export function requireAdmin(a: Actor) {
  if (!isAdmin(a)) throw new AppError("Action réservée à l'administrateur.", 403);
}

export const canWriteDepot = (a: Actor, depotId: unknown) => isAdmin(a) || a.depotIds.includes(String(depotId));

/** Refuse l'opération si le dépôt n'est pas attribué à l'utilisateur. */
export function assertCanWriteDepot(a: Actor, depotId: unknown, depotName?: string, what = "effectuer cette opération") {
  if (!canWriteDepot(a, depotId)) {
    throw new AppError(`Vous ne pouvez pas ${what} pour ${depotName ?? "ce dépôt"} : il ne vous est pas attribué (consultation seule).`, 403);
  }
}
