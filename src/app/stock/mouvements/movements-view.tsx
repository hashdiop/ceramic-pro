"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatDateTime } from "@/lib/units";
import type { MovementDTO } from "@/lib/types";
import { useDepots } from "@/components/depot-context";
import { Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export const TYPE_LABEL: Record<string, [string, string]> = {
  ENTREE: ["Entrée", "bg-emerald-100 text-emerald-700"],
  VENTE: ["Vente", "bg-slate-200 text-slate-700"],
  TRANSFERT_SORTIE: ["Transfert sortie", "bg-sky-100 text-sky-700"],
  TRANSFERT_ENTREE: ["Transfert entrée", "bg-sky-100 text-sky-700"],
  ECART_TRANSFERT: ["Écart transfert", "bg-red-100 text-red-700"],
  CASSE: ["Casse", "bg-amber-100 text-amber-800"],
  AJUSTEMENT: ["Ajustement", "bg-violet-100 text-violet-700"],
};

export function MovementsView() {
  const { depots } = useDepots();
  const [depotId, setDepotId] = useState("");
  const { data, error, loading } = useApi<MovementDTO[]>(`/api/stock/movements?limit=200${depotId ? `&depotId=${depotId}` : ""}`, [REALTIME_EVENTS.stock]);

  return (
    <>
      <PageHeader
        title="Journal des mouvements"
        subtitle="Traçabilité complète des entrées et sorties"
        actions={
          <Link href="/stock" className="btn-ghost">
            ← Stock
          </Link>
        }
      />
      <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className="input mb-3 sm:max-w-xs">
        <option value="">Tous les dépôts</option>
        {depots.map((d) => (
          <option key={d._id} value={d._id}>
            {d.code} — {d.name}
          </option>
        ))}
      </select>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <Empty>Aucun mouvement.</Empty>}

      <ul className="card divide-y divide-slate-100">
        {(data ?? []).map((m) => {
          const [label, cls] = TYPE_LABEL[m.type] ?? [m.type, "bg-slate-100"];
          return (
            <li key={m._id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
                  {m.refNumber && <span className="text-[11px] font-semibold text-slate-500">{m.refNumber}</span>}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-800">{m.product?.name ?? "—"}</div>
                <div className="text-xs text-slate-500">
                  {m.depot?.name} · bain {m.lot} · {formatDateTime(m.createdAt)}
                  {m.createdByName ? ` · par ${m.createdByName}` : ""}
                </div>
                {m.note && <div className="text-xs italic text-slate-400">{m.note}</div>}
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${m.deltaBoxes > 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {m.deltaBoxes > 0 ? "+" : ""}
                  {m.deltaBoxes} cs
                </div>
                <div className="text-[11px] text-slate-400">solde {m.balanceAfter}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
