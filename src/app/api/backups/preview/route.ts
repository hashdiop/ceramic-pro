import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { AppError } from "@/server/errors";
import { previewRestore } from "@/server/backup/service";

/** Aperçu d'une restauration : écart entre la sauvegarde et la base actuelle. */
export const GET = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const id = searchParam(req, "id");
  if (!id) throw new AppError("Sauvegarde non précisée.", 422);
  return previewRestore(id);
});
