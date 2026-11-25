/**
 * Sauvegarde / restauration en ligne de commande (fonctionne même si la base a été supprimée :
 * aucune connexion à l'application n'est nécessaire).
 *
 *   npm run backup:list                         sauvegardes disponibles
 *   npm run backup -- --note="avant inventaire" nouvelle sauvegarde manuelle
 *   npm run restore                             choix interactif dans la liste
 *   npm run restore -- --latest                 la plus récente
 *   npm run restore -- --index=3                la n° 3 de la liste
 *   npm run restore -- --file=sauvegarde.cpb    un fichier téléchargé
 *   npm run backup:download -- --index=1 --out=ma-copie.cpb
 *
 * Options : --db=<nom> cible une autre base (répétition sans risque), --confirm=RESTAURER évite la question.
 * Variables lues dans .env.local : MONGODB_URI, MONGODB_DB, BACKUP_KEY, CLOUDINARY_*.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables déjà présentes */
}

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : "true"];
  }),
) as Record<string, string>;
if (args.db) process.env.MONGODB_DB = args.db;

const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Dakar" });
const KIND: Record<string, string> = { MANUELLE: "manuelle", AVANT_RESTAURATION: "avant restauration", AUTO: "automatique" };
const FR: Record<string, string> = { products: "produits", invoices: "factures", stockmovements: "mouvements", transfers: "transferts", users: "comptes", depots: "dépôts", stocklots: "lots", counters: "compteurs" };
const summary = (c: Record<string, number>) =>
  `${c.products ?? 0} produits · ${c.invoices ?? 0} factures · ${c.stockmovements ?? 0} mouvements · ${c.transfers ?? 0} transferts · ${c.users ?? 0} comptes`;

async function main() {
  const cmd = process.argv[2];
  const { default: mongoose } = await import("mongoose");
  const svc = await import("@/server/backup/service");
  const cld = await import("@/server/cloudinary");
  const { readManifest } = await import("@/server/backup/format");
  const { env } = await import("@/lib/env");
  const who = "Ligne de commande";

  const printList = async () => {
    const list = await svc.listBackupsWithDelta();
    if (!list.length) console.log("Aucune sauvegarde sur Cloudinary.");
    list.forEach((b, i) => {
      const delta = b.delta ? Object.entries(b.delta).filter(([, v]) => v).filter(([k]) => k !== "counters").map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${FR[k] ?? k}`).join(", ") : "première sauvegarde";
      console.log(`\n [${i + 1}] ${fmtDate(b.createdAt)} · ${KIND[b.kind] ?? b.kind} · par ${b.by || "?"} · ${(b.bytes / 1024).toFixed(1)} Ko`);
      if (b.note) console.log(`     note : ${b.note}`);
      console.log(`     ${summary(b.counts)}`);
      console.log(`     depuis la précédente : ${delta || "aucun changement de volume"}`);
    });
    return list;
  };

  try {
    if (cmd === "list") {
      console.log(`Sauvegardes (dossier Cloudinary « ${env.cloudinary.folder}/backups ») :`);
      await printList();
    } else if (cmd === "create") {
      console.log(`Base « ${env.mongodbDb} » : sauvegarde en cours…`);
      const r = await svc.createBackup({ by: who, note: args.note ?? "" });
      console.log(`✔ ${r.id} (${(r.bytes / 1024).toFixed(1)} Ko)\n  ${summary(r.manifest.counts)}`);
    } else if (cmd === "download") {
      const list = await svc.listBackupsWithDelta();
      const b = args.latest ? list[0] : list[Number(args.index) - 1];
      if (!b) throw new Error("Précisez --latest ou --index=N (voir npm run backup:list).");
      const out = args.out ?? `${b.id.split("/").pop()}`;
      writeFileSync(out, await cld.fetchBackup(b.id));
      console.log(`✔ Téléchargée : ${out}`);
    } else if (cmd === "restore") {
      let source: { id: string } | { file: Buffer };
      let label: string;
      if (args.file) {
        const file = readFileSync(args.file);
        const m = readManifest(file);
        source = { file };
        label = `fichier ${args.file} — sauvegarde du ${fmtDate(m.createdAt)} (${KIND[m.kind] ?? m.kind}) · ${summary(m.counts)}`;
      } else {
        console.log("Sauvegardes disponibles :");
        const list = await printList();
        if (!list.length) throw new Error("Aucune sauvegarde à restaurer.");
        let index = args.latest ? 1 : Number(args.index);
        if (!index) {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          index = Number(await rl.question("\nNuméro de la sauvegarde à restaurer : "));
          rl.close();
        }
        const b = list[index - 1];
        if (!b) throw new Error(`Numéro invalide : ${index}.`);
        source = { id: b.id };
        label = `[${index}] ${fmtDate(b.createdAt)} (${KIND[b.kind] ?? b.kind}) · ${summary(b.counts)}`;
      }

      const now = await svc.currentCounts();
      console.log(`\nBase cible : « ${env.mongodbDb} » — actuellement : ${summary(now)}`);
      console.log(`À restaurer : ${label}`);
      console.log("⚠️  Toutes les données actuelles de cette base seront remplacées.");
      let confirm = args.confirm;
      if (!confirm) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        confirm = await rl.question("Tapez RESTAURER pour confirmer : ");
        rl.close();
      }
      if (confirm.trim() !== "RESTAURER") throw new Error("Restauration annulée.");
      const r = await svc.restoreBackup({ source, by: who });
      console.log(`\n✔ Restauration terminée : ${summary(r.counts)}`);
      if (r.safetyBackupId) console.log(`  Sauvegarde de sécurité de l'état précédent : ${r.safetyBackupId}`);
      else console.log("  (base vide avant restauration : pas de sauvegarde de sécurité)");
      console.log(`  Photos remises en place : ${r.photos.restored}${r.photos.missing.length ? ` · introuvables : ${r.photos.missing.length}` : ""}`);
    } else {
      throw new Error("Commande inconnue (list, create, download, restore).");
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
