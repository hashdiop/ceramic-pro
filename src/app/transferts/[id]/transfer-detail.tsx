"use client";

import Link from "next/link";
import { useState } from "react";
import { apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatDateTime, formatM2, m2ForBoxes } from "@/lib/units";
import type { TransferDTO } from "@/lib/types";
import { ErrorBox, PageHeader, Spinner, TransferBadge } from "@/components/ui";

export function TransferDetail({ id }: { id: string }) {
  const { data: t, error, loading, reload } = useApi<TransferDTO>(`/api/transfers/${id}`, [REALTIME_EVENTS.transfers]);
  const [received, setReceived] = useState<Record<string, { boxes: number; note: string }>>({});
  const [receivedBy, setReceivedBy] = useState("");
  const [receptionNote, setReceptionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"receive" | "cancel" | null>(null);

  if (error) return <ErrorBox message={error} />;
  if (loading && !t) return <Spinner />;
  if (!t) return null;

  const get = (lineId: string, sent: number) => received[lineId] ?? { boxes: sent, note: "" };
  const gaps = t.lines.filter((l) => get(l._id, l.sentBoxes).boxes < l.sentBoxes);

  async function act(kind: "receive" | "cancel") {
    if (!t) return;
    setActionError(null);
    setBusy(true);
    try {
      if (kind === "receive") {
        await apiPost(`/api/transfers/${t._id}/receive`, {
          receivedBy,
          receptionNote,
          lines: t.lines.map((l) => ({ lineId: l._id, receivedBoxes: get(l._id, l.sentBoxes).boxes, note: get(l._id, l.sentBoxes).note })),
        });
      } else {
        await apiPost(`/api/transfers/${t._id}/cancel`);
      }
      setConfirming(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const totalSent = t.lines.reduce((s, l) => s + l.sentBoxes, 0);

  return (
    <>
      <PageHeader
        title={t.number}
        subtitle={`${t.fromDepot?.name} → ${t.toDepot?.name}`}
        actions={
          <>
            <Link href="/transferts" className="btn-ghost">
              ← Transferts
            </Link>
            <Link href={`/transferts/${t._id}/bl`} className="btn-primary">
              Bon de livraison
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-2 p-4 text-sm lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="section-title">Statut</span>
            <TransferBadge status={t.status} />
          </div>
          <Info label="Expédié le" value={formatDateTime(t.sentAt)} />
          {t.driver && <Info label="Chauffeur" value={t.driver} />}
          {t.vehicle && <Info label="Véhicule" value={t.vehicle} />}
          {t.note && <Info label="Note" value={t.note} />}
          {t.status === "RECU" && (
            <>
              <Info label="Reçu le" value={t.receivedAt ? formatDateTime(t.receivedAt) : "—"} />
              <Info label="Réceptionné par" value={t.receivedBy || "—"} />
              {t.receptionNote && <Info label="Note réception" value={t.receptionNote} />}
            </>
          )}
          {t.status === "EN_TRANSIT" && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Les {totalSent} caisses sont réservées au départ ({t.fromDepot?.name}) et ne sont plus vendables. Aucun compteur ne bouge avant la
              validation de la réception.
            </p>
          )}
        </section>

        <section className="card p-4 lg:col-span-2">
          <h2 className="section-title mb-3">{t.status === "EN_TRANSIT" ? "Contrôle à la réception" : "Articles"}</h2>
          <ul className="divide-y divide-slate-100">
            {t.lines.map((l) => {
              const r = get(l._id, l.sentBoxes);
              const gap = t.status === "RECU" && l.receivedBoxes !== null ? l.sentBoxes - l.receivedBoxes : 0;
              return (
                <li key={l._id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{l.name}</div>
                      <div className="text-xs text-slate-500">
                        {l.ref} · bain {l.lot} · {formatM2(m2ForBoxes(l.sentBoxes, l.m2PerBox))}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold text-slate-900">{l.sentBoxes} cs envoyées</div>
                      {t.status === "RECU" && (
                        <div className={gap > 0 ? "text-xs font-semibold text-red-600" : "text-xs text-emerald-700"}>
                          {l.receivedBoxes} reçues{gap > 0 && ` (écart −${gap})`}
                        </div>
                      )}
                    </div>
                  </div>
                  {t.status === "RECU" && l.note && <div className="text-xs italic text-slate-500">{l.note}</div>}
                  {t.status === "EN_TRANSIT" && (
                    <div className="grid grid-cols-3 gap-2">
                      <label>
                        <span className="label">Reçues</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={l.sentBoxes}
                          value={r.boxes}
                          onChange={(e) =>
                            setReceived({
                              ...received,
                              [l._id]: { ...r, boxes: Math.min(l.sentBoxes, Math.max(0, Math.trunc(Number(e.target.value)))) },
                            })
                          }
                          className="input"
                        />
                      </label>
                      <label className="col-span-2">
                        <span className="label">Observation</span>
                        <input
                          value={r.note}
                          onChange={(e) => setReceived({ ...received, [l._id]: { ...r, note: e.target.value } })}
                          placeholder={r.boxes < l.sentBoxes ? "Casse transport, manquant…" : ""}
                          className="input"
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {t.status === "EN_TRANSIT" && (
            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="label">Réceptionné par</span>
                  <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Nom du magasinier" className="input" />
                </label>
                <label>
                  <span className="label">Note de réception</span>
                  <input value={receptionNote} onChange={(e) => setReceptionNote(e.target.value)} className="input" />
                </label>
              </div>
              {gaps.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {gaps.length} ligne(s) avec écart : les caisses manquantes seront inscrites au journal comme « Écart transfert ».
                </p>
              )}
              {actionError && <ErrorBox message={actionError} />}

              {confirming ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-3 text-sm font-medium text-slate-800">
                    {confirming === "receive"
                      ? `Confirmer la réception ? Le stock de ${t.fromDepot?.name} et de ${t.toDepot?.name} sera mis à jour. Cette action est définitive.`
                      : "Annuler ce transfert ? Les réservations seront libérées au dépôt expéditeur."}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirming(null)} className="btn-ghost flex-1" disabled={busy}>
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => act(confirming)}
                      className={confirming === "receive" ? "btn-success flex-1" : "btn-danger flex-1"}
                      disabled={busy}
                    >
                      {busy ? "Traitement…" : "Confirmer"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming("cancel")} className="btn-danger flex-1">
                    Annuler le transfert
                  </button>
                  <button type="button" onClick={() => setConfirming("receive")} className="btn-success flex-[2]">
                    ✓ Valider la réception
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
