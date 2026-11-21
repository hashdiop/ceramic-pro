"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatDateTime, formatM2, m2ForBoxes } from "@/lib/units";
import type { InTransitDTO, TransferDTO, TransferStatus } from "@/lib/types";
import { Chips, Empty, ErrorBox, PageHeader, Spinner, TransferBadge } from "@/components/ui";

const TABS = ["En transit", "Reçus", "Annulés", "Tous"] as const;
const TAB_STATUS: Record<(typeof TABS)[number], TransferStatus | ""> = {
  "En transit": "EN_TRANSIT",
  Reçus: "RECU",
  Annulés: "ANNULE",
  Tous: "",
};

export function TransferList() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("En transit");
  const status = TAB_STATUS[tab];
  const events = [REALTIME_EVENTS.transfers];
  const list = useApi<TransferDTO[]>(`/api/transfers${status ? `?status=${status}` : ""}`, events);
  const transit = useApi<InTransitDTO[]>("/api/transfers/in-transit", events);

  return (
    <>
      <PageHeader
        title="Transferts inter-dépôts"
        subtitle="Le stock des deux dépôts n'est mis à jour qu'à la validation de la réception"
        actions={
          <Link href="/transferts/nouveau" className="btn-accent">
            + Nouveau transfert
          </Link>
        }
      />

      <section className="card mb-4 p-4">
        <h2 className="section-title mb-3">Quantités en transit</h2>
        {transit.error && <ErrorBox message={transit.error} />}
        {transit.data && transit.data.length === 0 && <Empty>Aucune marchandise en transit.</Empty>}
        {transit.data && transit.data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {transit.data.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.from} → {t.to} · {t.transfers.join(", ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-sky-700">{t.boxes} cs</div>
                  <div className="text-[11px] text-slate-500">{formatM2(m2ForBoxes(t.boxes, t.m2PerBox))}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-3">
        <Chips options={TABS} value={tab} onChange={setTab} />
      </div>

      {list.error && <ErrorBox message={list.error} />}
      {list.loading && !list.data && <Spinner />}
      {list.data && list.data.length === 0 && <Empty>Aucun transfert.</Empty>}

      <ul className="grid gap-2.5 lg:grid-cols-2">
        {(list.data ?? []).map((t) => {
          const boxes = t.lines.reduce((s, l) => s + l.sentBoxes, 0);
          return (
            <li key={t._id}>
              <Link href={`/transferts/${t._id}`} className="card block p-3.5 transition hover:border-brand-500">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{t.number}</span>
                  <TransferBadge status={t.status} />
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {t.fromDepot?.name} <span className="text-slate-400">→</span> {t.toDepot?.name}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {t.lines.length} article(s) · {boxes} cs · envoyé le {formatDateTime(t.sentAt)}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
