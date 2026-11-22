"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatCFA, formatDate, formatM2 } from "@/lib/units";
import type { DashboardDTO } from "@/lib/types";
import {
  Empty,
  ErrorBox,
  GlobalStockBadge,
  Kpi,
  PageHeader,
  ProductThumb,
  Spinner,
} from "@/components/ui";
import { ProductModal } from "@/components/product-modal";

export function Dashboard() {
  const { data, error, loading } = useApi<DashboardDTO>("/api/dashboard", [
    REALTIME_EVENTS.invoices,
    REALTIME_EVENTS.stock,
    REALTIME_EVENTS.transfers,
  ]);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Ventes, stock et transferts"
        actions={
          <Link href="/vente" className="btn-accent">
            + Nouvelle vente
          </Link>
        }
      />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="CA net"
              value={formatCFA(data.revenue)}
              hint={`${data.invoiceCount} facture(s)`}
            />
            <Kpi
              label="Volume vendu"
              value={formatM2(data.volume)}
              tone="emerald"
            />
            <Kpi
              label="Reports de casse"
              value={formatCFA(data.breakage)}
              tone="amber"
            />
            <Link href="/transferts" className="block">
              <Kpi
                label="Transferts en transit"
                value={String(data.inTransitCount)}
                tone="sky"
                hint="Voir les transferts →"
              />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">Alertes de stock (réseau)</h2>
                <Link
                  href="/stock?filtre=alertes"
                  className="text-xs font-semibold text-brand-700"
                >
                  Tout voir →
                </Link>
              </div>
              {data.alerts.length === 0 ? (
                <Empty>
                  Aucune alerte : tous les produits sont au-dessus de leurs
                  seuils.
                </Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.alerts.slice(0, 8).map((a) => {
                    const low = a.depots
                      .filter((d) => d.status !== "OK")
                      .map((d) => d.depotName);
                    return (
                      <li key={a.productId}>
                        <button
                          type="button"
                          onClick={() => setDetail(a.productId)}
                          className="flex w-full items-center gap-3 py-2.5 text-left"
                        >
                          <ProductThumb
                            src={a.imageUrl}
                            alt={a.name}
                            size="h-10 w-10"
                            px={40}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-800">
                              {a.name}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {a.status === "REEQUILIBRER"
                                ? `Bas à ${low.join(", ")} · stock ailleurs`
                                : `Réseau : seuil ${a.globalMinBoxes} cs`}
                              {a.incomingBoxes > 0 && (
                                <span className="text-sky-600">
                                  {" "}
                                  · {a.incomingBoxes} en route
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-bold text-slate-900">
                              {a.availableBoxes} cs
                            </div>
                            <GlobalStockBadge status={a.status} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card p-4">
              <h2 className="section-title mb-3">Ventes par motif</h2>
              {data.motifs.length === 0 ? (
                <Empty>Aucune vente enregistrée.</Empty>
              ) : (
                <div className="space-y-3">
                  {data.motifs.map((m) => {
                    const pct =
                      data.volume > 0
                        ? Math.round((m.m2 / data.volume) * 100)
                        : 0;
                    return (
                      <div key={m.motif}>
                        <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-xs font-semibold">
                          <span className="text-slate-800">{m.motif}</span>
                          <span className="text-slate-600">
                            {formatM2(m.m2)} ({pct}%) · {formatCFA(m.net)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100">
                          <div
                            className="h-2.5 rounded-full bg-brand-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {m.breakage > 0 && (
                          <div className="mt-0.5 text-[11px] text-amber-700">
                            dont casse déduite : {formatCFA(m.breakage)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Dernières factures</h2>
              <Link
                href="/factures"
                className="text-xs font-semibold text-brand-700"
              >
                Historique →
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <Empty>Aucune facture.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recent.map((inv) => (
                  <li key={inv._id}>
                    <Link
                      href={`/factures/${inv._id}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800">
                          {inv.number}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {inv.client.name} · {formatDate(inv.createdAt)} ·{" "}
                          {inv.depot?.code}
                        </div>
                      </div>
                      <div className="text-right text-sm font-bold text-emerald-700">
                        {formatCFA(inv.netTotal)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <ProductModal productId={detail} onClose={() => setDetail(null)} />
    </>
  );
}
