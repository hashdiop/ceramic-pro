"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatM2, m2ForBoxes } from "@/lib/units";
import type { StockRowDTO } from "@/lib/types";
import { useDepots } from "@/components/depot-context";
import { ProductModal } from "@/components/product-modal";
import {
  Chips,
  Empty,
  ErrorBox,
  Kpi,
  PageHeader,
  ProductThumb,
  Spinner,
  StockBadge,
} from "@/components/ui";

const STATUS_FILTERS = ["Tous", "Alertes", "Rupture"] as const;

export function StockView() {
  const params = useSearchParams();
  const { depots } = useDepots();
  const [depotCode, setDepotCode] = useState("Tous dépôts");
  const [statusFilter, setStatusFilter] = useState<
    (typeof STATUS_FILTERS)[number]
  >(params.get("filtre") === "alertes" ? "Alertes" : "Tous");
  const [motif, setMotif] = useState("Tous");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const { data, error, loading } = useApi<StockRowDTO[]>("/api/stock", [
    REALTIME_EVENTS.stock,
    REALTIME_EVENTS.transfers,
  ]);

  const depotOptions = useMemo(
    () => ["Tous dépôts", ...depots.map((d) => d.code)],
    [depots],
  );
  const motifs = useMemo(
    () => ["Tous", ...new Set((data ?? []).map((r) => r.motif))],
    [data],
  );

  const rows = (data ?? []).filter(
    (r) =>
      (depotCode === "Tous dépôts" || r.depotCode === depotCode) &&
      (motif === "Tous" || r.motif === motif) &&
      (statusFilter === "Tous" ||
        (statusFilter === "Alertes"
          ? r.status !== "OK"
          : r.status === "RUPTURE")) &&
      (!q || `${r.name} ${r.ref}`.toLowerCase().includes(q.toLowerCase())),
  );

  // Regroupement par produit, avec le détail par dépôt.
  const groups = useMemo(() => {
    const m = new Map<string, StockRowDTO[]>();
    for (const r of rows) {
      if (!m.has(r.productId)) m.set(r.productId, []);
      m.get(r.productId)!.push(r);
    }
    return [...m.values()];
  }, [rows]);

  const totals = rows.reduce(
    (acc, r) => ({
      available: acc.available + r.availableBoxes,
      reserved: acc.reserved + r.reservedBoxes,
      incoming: acc.incoming + r.incomingBoxes,
      alerts: acc.alerts + (r.status !== "OK" ? 1 : 0),
      m2: acc.m2 + m2ForBoxes(r.availableBoxes, r.m2PerBox),
    }),
    { available: 0, reserved: 0, incoming: 0, alerts: 0, m2: 0 },
  );

  return (
    <>
      <PageHeader
        title="Stock multi-dépôt"
        subtitle="Disponible = physique − réservé pour transfert"
        actions={
          <>
            <Link href="/stock/mouvements" className="btn-ghost">
              Journal
            </Link>
            <Link href="/stock/operation" className="btn-accent">
              + Opération
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Disponible"
          value={`${totals.available} cs`}
          hint={formatM2(totals.m2)}
          tone="emerald"
        />
        <Kpi
          label="Réservé (départ)"
          value={`${totals.reserved} cs`}
          tone="amber"
        />
        <Kpi
          label="En route (arrivée)"
          value={`${totals.incoming} cs`}
          tone="sky"
        />
        <Kpi
          label="Alertes"
          value={String(totals.alerts)}
          tone={totals.alerts ? "red" : "slate"}
        />
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un article…"
          className="input"
        />
        <Chips
          options={depotOptions}
          value={depotCode}
          onChange={setDepotCode}
        />
        <Chips
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Chips options={motifs} value={motif} onChange={setMotif} />
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && groups.length === 0 && (
        <Empty>Aucun article ne correspond aux filtres.</Empty>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const p = g[0];
          const isOpen = open === p.productId;
          const available = g.reduce((s, r) => s + r.availableBoxes, 0);
          return (
            <section key={p.productId} className="card p-3.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDetail(p.productId)}
                  className="shrink-0"
                  aria-label={`Fiche ${p.name}`}
                >
                  <ProductThumb
                    src={p.imageUrl}
                    alt={p.name}
                    size="h-12 w-12"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.productId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {p.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.ref} · {p.format} · min. {p.minStockBoxes} cs/dépôt
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-slate-900">
                      {available} cs
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatM2(m2ForBoxes(available, p.m2PerBox))}
                    </div>
                  </div>
                </button>
              </div>

              <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
                {g.map((r) => (
                  <li key={r.depotId} className="py-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700">
                        {r.depotName}
                      </span>
                      <StockBadge status={r.status} />
                    </div>
                    <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px]">
                      <Stat label="Physique" value={r.onHandBoxes} />
                      <Stat
                        label="Réservé"
                        value={r.reservedBoxes}
                        tone="text-amber-700"
                      />
                      <Stat
                        label="Dispo"
                        value={r.availableBoxes}
                        tone="text-emerald-700"
                      />
                      <Stat
                        label="En route"
                        value={r.incomingBoxes}
                        tone="text-sky-700"
                      />
                    </div>
                    {isOpen && (
                      <div className="mt-2 space-y-1">
                        {r.lots.length === 0 ? (
                          <div className="text-[11px] italic text-slate-400">
                            Aucun bain en stock
                          </div>
                        ) : (
                          r.lots.map((l) => (
                            <div
                              key={l.lot}
                              className="flex justify-between rounded-lg bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200"
                            >
                              <span className="font-semibold text-slate-700">
                                Bain {l.lot}
                              </span>
                              <span className="text-slate-600">
                                {l.availableBoxes} dispo
                                {l.reservedBoxes > 0 &&
                                  ` · ${l.reservedBoxes} réservé`}{" "}
                                / {l.onHandBoxes} cs
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : p.productId)}
                className="mt-2 w-full text-center text-xs font-semibold text-brand-700"
              >
                {isOpen ? "Masquer les bains" : "Voir les bains (lots)"}
              </button>
            </section>
          );
        })}
      </div>
      <ProductModal productId={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function Stat({
  label,
  value,
  tone = "text-slate-800",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}
