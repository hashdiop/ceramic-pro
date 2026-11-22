import { route } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { userUpdateSchema } from "@/lib/schemas";
import { updateUser } from "@/server/services/users";

/** Modification d'un compte : nom, rôle, dépôts, activation, mot de passe provisoire. */
export const PATCH = route<RouteContext<"/api/users/[id]">>(async (req, ctx, actor) => {
  requireAdmin(actor);
  const { id } = await ctx.params;
  return updateUser(actor, id, userUpdateSchema.parse(await req.json()));
});
