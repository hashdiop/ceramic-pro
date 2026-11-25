import { NextResponse } from "next/server";
import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { AppError } from "@/server/errors";
import { backupDownloadUrl } from "@/server/cloudinary";

/** Redirige vers un lien de téléchargement signé (5 min). Le fichier reste chiffré. */
export const GET = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const id = searchParam(req, "id");
  if (!id) throw new AppError("Sauvegarde non précisée.", 422);
  return NextResponse.redirect(backupDownloadUrl(id));
});
