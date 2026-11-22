"use client";

import { useState } from "react";
import { apiPatch, apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { DepotDTO, StockRowDTO } from "@/lib/types";
import { Sheet } from "@/components/sheet";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

type Draft = { code: string; name: string; address: string; phone: string };

export function DepotsAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const depots = useApi<DepotDTO[]>("/api/depots?all=1", [REALTIME_EVENTS.catalog]);
  const stock = useApi<StockRowDTO[]>("/api/stock", [REALTIME_EVENTS.stock]);
  const [editing, setEditing] = useState<DepotDTO | "new" | null>(null);

  // Synthèse du stock par dépôt (dépôts actifs uniquement).
  const summary = new Map<string, { boxes: number; alerts: number; incoming: number }>();
  for (const r of stock.data ?? []) {
    const s = summary.get(r.depotId) ?? { boxes: 0, alerts: 0, incoming: 0 };
    s.boxes += r.onHandBoxes;
    s.incoming += r.incomingBoxes;
    if (r.status !== "OK") s.alerts += 1;
    summary.set(r.depotId, s);
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        {!readOnly && (
          <button type="button" onClick={() => setEditing("new")} className="btn-accent">
            + Nouveau dépôt
          </button>
        )}
      </div>
      {depots.error && <ErrorBox message={depots.error} />}
      {depots.loading && !depots.data && <Spinner />}
      {depots.data && depots.data.length === 0 && <Empty>Aucun dépôt.</Empty>}

      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        {(depots.data ?? []).map((d) => {
          const s = summary.get(d._id);
          return (
            <li key={d._id}>
              <button
                type="button"
                onClick={() => !readOnly && setEditing(d)}
                disabled={readOnly}
                className={`card block w-full p-4 text-left transition hover:border-brand-500 ${d.active === false ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{d.code}</span>
                  {d.active === false && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Archivé</span>}
                </div>
                <div className="mt-2 font-bold text-slate-900">{d.name}</div>
                {d.address && <div className="text-xs text-slate-500">{d.address}</div>}
                {d.phone && <div className="text-xs text-slate-500">{d.phone}</div>}
                {s && (
                  <div className="mt-3 flex gap-3 border-t border-slate-100 pt-2 text-xs">
                    <span className="font-semibold text-slate-700">{s.boxes} cs en stock</span>
                    {s.incoming > 0 && <span className="text-sky-700">{s.incoming} en route</span>}
                    {s.alerts > 0 && <span className="text-red-600">{s.alerts} alerte(s)</span>}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={editing !== null} title={editing === "new" ? "Nouveau dépôt" : "Modifier le dépôt"} onClose={() => setEditing(null)}>
        {editing !== null && (
          <DepotForm key={editing === "new" ? "new" : editing._id} depot={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  );
}

function DepotForm({ depot, onDone }: { depot: DepotDTO | null; onDone: () => void }) {
  const [d, setD] = useState<Draft>({
    code: depot?.code ?? "",
    name: depot?.name ?? "",
    address: depot?.address ?? "",
    phone: depot?.phone ?? "",
  });
  const [busy, setBusy] = useState<null | "save" | "toggle">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  async function run(kind: "save" | "toggle", fn: () => Promise<unknown>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(null);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run("save", () => (depot ? apiPatch(`/api/depots/${depot._id}`, d) : apiPost("/api/depots", d)));
  };
  const active = depot?.active !== false;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="label">Code *</span>
          <input value={d.code} onChange={set("code")} required maxLength={10} className="input uppercase" placeholder="MBR" />
        </label>
        <label className="col-span-2">
          <span className="label">Nom *</span>
          <input value={d.name} onChange={set("name")} required className="input" placeholder="Dépôt Mbour" />
        </label>
        <label className="col-span-3">
          <span className="label">Adresse</span>
          <input value={d.address} onChange={set("address")} className="input" />
        </label>
        <label className="col-span-3">
          <span className="label">Téléphone</span>
          <input value={d.phone} onChange={set("phone")} type="tel" inputMode="tel" className="input" />
        </label>
      </div>
      <p className="text-xs text-slate-500">L&apos;adresse et le téléphone figurent sur les bons de livraison.</p>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="submit" disabled={busy !== null} className="btn-primary sm:flex-1">
          {busy === "save" ? "Enregistrement…" : depot ? "Enregistrer" : "Créer le dépôt"}
        </button>
        {depot && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("toggle", () => apiPatch(`/api/depots/${depot._id}`, { active: !active }))}
            className={active ? "btn-danger sm:flex-1" : "btn-ghost sm:flex-1"}
          >
            {busy === "toggle" ? "Traitement…" : active ? "Archiver" : "Réactiver"}
          </button>
        )}
      </div>
    </form>
  );
}
