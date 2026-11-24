import { Types } from "mongoose";
import { connectDB } from "@/server/db";
import { AppError } from "@/server/errors";
import { Depot, User, type Role } from "@/server/models";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { createToken } from "@/server/auth/token";
import type { Actor } from "@/server/context";
import type { UserInput, UserUpdate } from "@/lib/schemas";

type UserLean = { _id: Types.ObjectId; email: string; name: string; phone?: string; role: string; depots?: Types.ObjectId[]; active: boolean; mustChangePassword: boolean; lastLoginAt?: Date | null; createdAt?: Date };

/** Vue publique d'un compte (jamais le hachage du mot de passe). */
const publicUser = (u: UserLean) => ({
  _id: String(u._id),
  email: u.email,
  name: u.name,
  phone: u.phone ?? "",
  role: u.role as Role,
  depotIds: (u.depots ?? []).map(String),
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt ?? null,
});

const sessionFor = (u: { _id: Types.ObjectId; tokenVersion: number; role: string; mustChangePassword: boolean }) =>
  createToken({ uid: String(u._id), v: u.tokenVersion, role: u.role as Role, mcp: u.mustChangePassword });

// Hachage factice : même temps de réponse que le compte existe ou non.
let dummyHash: Promise<string> | null = null;

export async function login(email: string, password: string) {
  await connectDB();
  const u = await User.findOne({ email: email.trim().toLowerCase() });
  if (!u || !u.active) {
    await verifyPassword(password, await (dummyHash ??= hashPassword("pas-un-vrai-compte")));
    throw new AppError("E-mail ou mot de passe incorrect.", 401);
  }
  if (!(await verifyPassword(password, u.passwordHash))) throw new AppError("E-mail ou mot de passe incorrect.", 401);
  u.lastLoginAt = new Date();
  await u.save();
  return { user: publicUser(u.toObject()), token: sessionFor(u) };
}

/** Changement de son propre mot de passe (obligatoire après un mot de passe provisoire). */
export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  await connectDB();
  const u = await User.findById(actor.id);
  if (!u) throw new AppError("Compte introuvable", 404);
  if (!(await verifyPassword(current, u.passwordHash))) throw new AppError("Mot de passe actuel incorrect.", 422);
  const problem = passwordProblem(next);
  if (problem) throw new AppError(problem, 422);
  if (current === next) throw new AppError("Choisissez un mot de passe différent de l'actuel.", 422);
  u.passwordHash = await hashPassword(next);
  u.mustChangePassword = false;
  u.tokenVersion += 1; // déconnecte les autres appareils
  await u.save();
  return { user: publicUser(u.toObject()), token: sessionFor(u) };
}

/* ------------------------------- Administration ------------------------------- */

export async function listUsers() {
  await connectDB();
  const users = await User.find().sort({ role: 1, email: 1 }).lean();
  return users.map((u) => publicUser(u as UserLean));
}

async function checkDepots(ids: string[]) {
  if (!ids.length) return;
  const n = await Depot.countDocuments({ _id: { $in: ids } });
  if (n !== new Set(ids).size) throw new AppError("Dépôt attribué introuvable.", 422);
}

export async function createUser(input: UserInput) {
  await connectDB();
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new AppError(`Le compte ${email} existe déjà.`, 409);
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, 422);
  await checkDepots(input.depotIds);
  const u = await User.create({
    email,
    name: input.name,
    phone: input.phone,
    role: input.role,
    depots: input.role === "ADMIN" ? [] : input.depotIds,
    passwordHash: await hashPassword(input.password),
    mustChangePassword: true,
  });
  return publicUser(u.toObject());
}

export async function updateUser(actor: Actor, id: string, input: UserUpdate) {
  await connectDB();
  const u = await User.findById(id);
  if (!u) throw new AppError("Compte introuvable", 404);
  const self = String(u._id) === actor.id;

  const losingAdmin = u.role === "ADMIN" && ((input.role && input.role !== "ADMIN") || input.active === false);
  if (losingAdmin) {
    if (self) throw new AppError("Vous ne pouvez pas retirer vos propres droits d'administrateur ni désactiver votre compte.", 409);
    if ((await User.countDocuments({ role: "ADMIN", active: true })) <= 1) throw new AppError("Il doit rester au moins un administrateur actif.", 409);
  }

  if (input.name !== undefined) u.name = input.name;
  if (input.phone !== undefined) u.phone = input.phone;
  if (input.role !== undefined) u.role = input.role;
  if (input.depotIds !== undefined) {
    await checkDepots(input.depotIds);
    u.depots = input.depotIds.map((d) => new Types.ObjectId(d));
  }
  if (u.role === "ADMIN") u.depots = [];
  if (input.active !== undefined && input.active !== u.active) {
    u.active = input.active;
    u.tokenVersion += 1; // coupe immédiatement les sessions ouvertes
  }
  if (input.resetPassword) {
    const problem = passwordProblem(input.resetPassword);
    if (problem) throw new AppError(problem, 422);
    u.passwordHash = await hashPassword(input.resetPassword);
    u.mustChangePassword = true;
    u.tokenVersion += 1;
  }
  await u.save();
  return publicUser(u.toObject());
}

/**
 * Comptes par défaut : admin@cpro.com + depot{N}@cpro.com pour chaque dépôt actif « DEP-N ».
 * Idempotent : un compte existant n'est jamais modifié.
 */
export async function ensureDefaultUsers(password: string) {
  await connectDB();
  const created: string[] = [];
  const add = async (email: string, name: string, role: Role, depots: Types.ObjectId[]) => {
    if (await User.exists({ email })) return;
    await User.create({ email, name, role, depots, passwordHash: await hashPassword(password), mustChangePassword: true });
    created.push(email);
  };
  await add("admin@cpro.com", "Administrateur", "ADMIN", []);
  const depots = await Depot.find({ active: true }).sort({ code: 1 }).lean();
  for (const d of depots) {
    const n = d.code.match(/(\d+)$/)?.[1];
    if (n) await add(`depot${Number(n)}@cpro.com`, `Responsable ${d.name}`, "USER", [d._id]);
  }
  return created;
}

/**
 * Annuaire du réseau, visible par tous les utilisateurs connectés :
 * chaque dépôt actif avec ses coordonnées et ses responsables (nom + téléphone uniquement).
 */
export async function getNetwork() {
  await connectDB();
  const [depots, users] = await Promise.all([
    Depot.find({ active: true }).sort({ code: 1 }).lean(),
    User.find({ active: true, role: "USER" }, { name: 1, phone: 1, depots: 1 }).lean(),
  ]);
  return depots.map((d) => ({
    _id: String(d._id),
    code: d.code,
    name: d.name,
    address: d.address ?? "",
    phone: d.phone ?? "",
    managers: users.filter((u) => (u.depots ?? []).some((id) => String(id) === String(d._id))).map((u) => ({ name: u.name, phone: u.phone ?? "" })),
  }));
}

/* --------------------------------- Mode démo --------------------------------- */

/** Seuls comptes accessibles par connexion rapide (et uniquement si DEMO_LOGIN=true). */
export const DEMO_EMAILS = ["admin@cpro.com", "depot1@cpro.com", "depot2@cpro.com"] as const;

export async function listDemoAccounts() {
  await connectDB();
  const users = await User.find({ email: { $in: DEMO_EMAILS }, active: true }).populate<{ depots: { name: string }[] }>("depots", "name", Depot).lean();
  return DEMO_EMAILS.map((email) => users.find((u) => u.email === email))
    .filter((u) => u !== undefined)
    .map((u) => ({ email: u.email, name: u.name, role: u.role as Role, depots: u.depots.map((d) => d.name) }));
}

/** Ouvre une session sans mot de passe pour un compte de démonstration. */
export async function demoLogin(email: string) {
  await connectDB();
  if (!(DEMO_EMAILS as readonly string[]).includes(email)) throw new AppError("Compte non disponible en mode démo.", 403);
  const u = await User.findOne({ email });
  if (!u || !u.active) throw new AppError("Compte de démonstration introuvable ou désactivé.", 404);
  u.lastLoginAt = new Date();
  await u.save();
  return { user: publicUser(u.toObject()), token: sessionFor(u) };
}
