"use client";

import { useRef, useState } from "react";
import { apiFetch, apiPost, useApi } from "@/lib/client/api";
import { formatDateTime } from "@/lib/units";
import { Sheet } from "@/components/sheet";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

interface Backup {
  id: string;
  bytes: number;
  createdAt: string;
  kind: string;
  by: string;
  note: string;
  counts: Record<string, number>;
  delta: Record<string, number> | null;
}
interface BackupsState {
  configured: boolean;
  backups: Backup[];
  current: Record<string, number>;
  history: { _id: string; action: string; by: string; detail: string; createdAt: string }[];
}
interface Manifest {
  createdAt: string;
  kind: string;
  by: string;
  note: string;
  counts: Record<string, number>;
}

const KIND: Record<string, [string, string]> = {
  MANUELLE: ["Manuelle", "bg-slate-900 text-white"],
  AVANT_RESTAURATION: ["Avant restauration", "bg-amber-100 text-amber-800"],
  AUTO: ["Automatique", "bg-sky-100 text-sky-700"],
};
const LABELS: Record<string, string> = {
  products: "produits",
  invoices: "factures",
  stockmovements: "mouvements",
  transfers: "transferts",
  stocklots: "lots",
  depots: "dépôts",
  users: "comptes",
  counters: "compteurs",
};
const MAIN = ["products", "invoices", "stockmovements", "transfers"];
const kb = (b: number) => `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} Ko`;

export function BackupsPanel() {
  const { data, error, loading, reload } = useApi<BackupsState>("/api/backups");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [importFile, setImportFile] = useState<{ file: File; manifest: Manifest } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (error) return <ErrorBox message={error} />;
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  if (!data.configured)
    return (
      <div className="card p-4 text-sm text-slate-600">
        <strong>Sauvegardes non configurées</strong> : ajoutez la variable <code>BACKUP_KEY</code> (32 caractères minimum) dans les variables d&apos;environnement,
        puis redéployez.
      </div>
    );

  async function backupNow() {
    setMsg(null);
    setBusy(true);
    try {
      const r = await apiPost<{ createdAt: string }>("/api/backups", { note });
      setMsg({ ok: true, text: `Sauvegarde créée (${formatDateTime(r.createdAt)}).` });
      setNote("");
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    try {
      const { manifest } = await apiFetch<{ manifest: Manifest }>("/api/backups/import", {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream" },
      });
      setImportFile({ file, manifest });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Fichier illisible" });
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/backups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div>
          <h2 className="section-title">Nouvelle sauvegarde</h2>
          <p className="mt-1 text-xs text-slate-500">
            Base actuelle : {MAIN.map((k) => `${data.current[k] ?? 0} ${LABELS[k]}`).join(" · ")}. Le fichier est chiffré et stocké de façon privée sur
            Cloudinary.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Note (facultatif) : avant inventaire…" className="input flex-1" />
          <button type="button" onClick={backupNow} disabled={busy} className="btn-primary">
            {busy ? "Sauvegarde…" : "Sauvegarder maintenant"}
          </button>
        </div>
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title">Sauvegardes disponibles ({data.backups.length})</h2>
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-ghost min-h-9 px-3 text-sm">
            Importer un fichier
          </button>
          <input ref={fileInput} type="file" accept=".cpb" onChange={pickFile} className="hidden" />
        </div>
        {data.backups.length === 0 && <Empty>Aucune sauvegarde pour l&apos;instant.</Empty>}
        <ul className="space-y-2.5">
          {data.backups.map((b, i) => {
            const [label, cls] = KIND[b.kind] ?? [b.kind, "bg-slate-100 text-slate-700"];
            const delta = b.delta ? MAIN.filter((k) => b.delta?.[k]).map((k) => `${b.delta![k] > 0 ? "+" : ""}${b.delta![k]} ${LABELS[k]}`) : null;
            return (
              <li key={b.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{formatDateTime(b.createdAt)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
                  {i === 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">La plus récente</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  par {b.by || "?"} · {kb(b.bytes)}
                  {b.note && <> · « {b.note} »</>}
                </div>
                <div className="mt-1 text-xs text-slate-700">{MAIN.map((k) => `${b.counts[k] ?? 0} ${LABELS[k]}`).join(" · ")}</div>
                <div className="text-[11px] text-slate-500">
                  {delta === null ? "Première sauvegarde" : delta.length ? `Depuis la précédente : ${delta.join(", ")}` : "Même volume que la précédente (contenu modifié)"}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href={`/api/backups/download?id=${encodeURIComponent(b.id)}`} className="btn-ghost min-h-9 px-3 text-xs">
                    ⬇ Télécharger
                  </a>
                  <button type="button" onClick={() => setRestoring(b)} className="btn-accent min-h-9 px-3 text-xs">
                    ↺ Restaurer
                  </button>
                  {deleting === b.id ? (
                    <>
                      <button type="button" onClick={() => remove(b.id)} className="btn-danger min-h-9 px-3 text-xs">
                        Confirmer la suppression
                      </button>
                      <button type="button" onClick={() => setDeleting(null)} className="btn-ghost min-h-9 px-3 text-xs">
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setDeleting(b.id)} className="min-h-9 px-2 text-xs font-medium text-red-600">
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {data.history.length > 0 && (
        <section className="card p-4">
          <h2 className="section-title mb-2">Historique</h2>
          <ul className="divide-y divide-slate-100 text-xs">
            {data.history.map((h) => (
              <li key={h._id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <strong className="text-slate-800">{h.action.toLowerCase()}</strong> · {h.detail}
                </span>
                <span className="text-slate-500">
                  {formatDateTime(h.createdAt)} · {h.by}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={restoring !== null} title="Restaurer une sauvegarde" onClose={() => setRestoring(null)}>
        {restoring && <RestoreFlow backup={restoring} />}
      </Sheet>
      <Sheet open={importFile !== null} title="Restaurer un fichier" onClose={() => setImportFile(null)}>
        {importFile && <RestoreFlow imported={importFile} />}
      </Sheet>
    </div>
  );
}

/** Aperçu de l'écart → saisie de RESTAURER → restauration (sauvegarde de sécurité automatique avant). */
function RestoreFlow({ backup, imported }: { backup?: Backup; imported?: { file: File; manifest: Manifest } }) {
  const preview = useApi<{ backup: Backup; current: Record<string, number>; diff: Record<string, number> }>(
    backup ? `/api/backups/preview?id=${encodeURIComponent(backup.id)}` : "/api/backups",
  );
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ safetyBackupId: string | null; photos: { restored: number; missing: string[] } } | null>(null);

  const target = backup ?? imported!.manifest;
  const current = (preview.data as { current?: Record<string, number> } | null)?.current;

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const r = backup
        ? await apiPost<{ safetyBackupId: string | null; photos: { restored: number; missing: string[] } }>("/api/backups/restore", { id: backup.id, confirm })
        : await apiFetch<{ safetyBackupId: string | null; photos: { restored: number; missing: string[] } }>(`/api/backups/import?confirm=${confirm}`, {
            method: "POST",
            body: imported!.file,
            headers: { "Content-Type": "application/octet-stream" },
          });
      setDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">✔ Restauration terminée.</p>
        <p className="text-slate-600">
          {done.safetyBackupId ? "L'état d'avant a été sauvegardé automatiquement (type « Avant restauration »)." : "La base était vide : pas de sauvegarde de sécurité."}{" "}
          Photos remises en place : {done.photos.restored}
          {done.photos.missing.length > 0 && ` · introuvables : ${done.photos.missing.length}`}.
        </p>
        {/* Rechargement complet : toutes les pages repartent des données restaurées. */}
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu après restauration */}
        <button type="button" onClick={() => window.location.assign("/admin?onglet=sauvegardes")} className="btn-primary w-full">
          Recharger l&apos;application
        </button>
      </div>
    );

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="font-bold text-slate-900">Sauvegarde du {formatDateTime(target.createdAt)}</div>
        <div className="text-xs text-slate-500">
          {KIND[target.kind]?.[0] ?? target.kind} · par {target.by || "?"}
          {target.note && ` · « ${target.note} »`}
          {imported && ` · fichier ${imported.file.name}`}
        </div>
      </div>

      {preview.loading && !preview.data ? (
        <Spinner />
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 font-medium" />
              <th className="py-1 text-right font-medium">Aujourd&apos;hui</th>
              <th className="py-1 text-right font-medium">Après</th>
              <th className="py-1 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.keys(LABELS).map((k) => {
              const now = current?.[k] ?? 0;
              const after = target.counts[k] ?? 0;
              const d = after - now;
              return (
                <tr key={k}>
                  <td className="py-1.5 capitalize text-slate-700">{LABELS[k]}</td>
                  <td className="py-1.5 text-right">{now}</td>
                  <td className="py-1.5 text-right font-semibold">{after}</td>
                  <td className={`py-1.5 text-right font-semibold ${d < 0 ? "text-red-600" : d > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                    {d > 0 ? "+" : ""}
                    {d}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
        <strong>Toutes les données actuelles seront remplacées</strong>, dans tous les dépôts. Les opérations faites depuis cette sauvegarde seront perdues.
        L&apos;état actuel est d&apos;abord sauvegardé automatiquement. Pendant la restauration, les enregistrements sont suspendus.
      </div>

      <label className="block">
        <span className="label">Tapez RESTAURER pour confirmer</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} className="input font-mono tracking-widest" autoComplete="off" />
      </label>
      {error && <ErrorBox message={error} />}
      <button type="button" onClick={run} disabled={confirm !== "RESTAURER" || busy} className="btn-danger w-full">
        {busy ? "Restauration en cours… ne fermez pas la page" : "Restaurer cette sauvegarde"}
      </button>
    </div>
  );
}
