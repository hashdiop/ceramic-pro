import { route } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { userInputSchema } from "@/lib/schemas";
import { createUser, listUsers } from "@/server/services/users";

/** Gestion des comptes : réservée à l'administrateur. */
export const GET = route(async (_req, _ctx, actor) => {
  requireAdmin(actor);
  return listUsers();
});

export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  return createUser(userInputSchema.parse(await req.json()));
});
