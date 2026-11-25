import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { AppError } from "@/server/errors";
import { readManifest } from "@/server/backup/format";
import { restoreBackup } from "@/server/backup/service";

/**
 * Restauration depuis un fichier .cpb téléchargé auparavant (corps brut).
 * ?confirm=RESTAURER obligatoire ; sans, renvoie seulement la description du fichier.
 */
export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const file = Buffer.from(await req.arrayBuffer());
  let manifest;
  try {
    manifest = readManifest(file);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Fichier illisible.", 422);
  }
  if (searchParam(req, "confirm") !== "RESTAURER") return { manifest };
  return restoreBackup({ source: { file }, by: actor.name });
});
