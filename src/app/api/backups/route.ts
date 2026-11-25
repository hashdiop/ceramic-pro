import { z } from "zod";
import { route, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/context";
import { env } from "@/lib/env";
import { AppError } from "@/server/errors";
import { deleteBackup } from "@/server/cloudinary";
import { backupHistory, createBackup, currentCounts, listBackupsWithDelta } from "@/server/backup/service";
import { BackupLog } from "@/server/models";

/** Sauvegardes disponibles (métadonnées), état actuel de la base et historique. Réservé à l'admin. */
export const GET = route(async (_req, _ctx, actor) => {
  requireAdmin(actor);
  if (!env.backupConfigured) return { configured: false, backups: [], current: await currentCounts(), history: [] };
  const [backups, current, history] = await Promise.all([listBackupsWithDelta(), currentCounts(), backupHistory()]);
  return { configured: true, backups, current, history };
});

const createBody = z.object({ note: z.string().trim().max(120).default("") });

/** Sauvegarde manuelle (refusée si rien n'a changé depuis la dernière : pas de doublon). */
export const POST = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const { note } = createBody.parse(await req.json().catch(() => ({})));
  const r = await createBackup({ by: actor.name, note });
  return { id: r.id, bytes: r.bytes, createdAt: r.manifest.createdAt, counts: r.manifest.counts };
});

export const DELETE = route(async (req, _ctx, actor) => {
  requireAdmin(actor);
  const id = searchParam(req, "id");
  if (!id) throw new AppError("Sauvegarde à supprimer non précisée.", 422);
  await deleteBackup(id);
  await BackupLog.create({ action: "SUPPRESSION", backupId: id, by: actor.name });
  return { ok: true };
});
