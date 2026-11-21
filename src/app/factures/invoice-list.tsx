"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatCFA, formatDate, formatM2 } from "@/lib/units";
import type { InvoiceDTO } from "@/lib/types";
import { Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export function InvoiceList() {
  const { data, error, loading } = useApi<InvoiceDTO[]>("/api/invoices?limit=200", [REALTIME_EVENTS.invoices]);
  const [q, setQ] = useState("");
  const list = (data ?? []).filter((i) => !q || `${i.number} ${i.client.name} ${i.client.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Historique des ventes enregistrées"
        actions={
          <Link href="/vente" className="btn-accent">
            + Nouvelle vente
          </Link>
        }
      />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° de facture, client, téléphone…" className="input mb-3" />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && list.length === 0 && <Empty>Aucune facture.</Empty>}

      {/* Mobile : cartes */}
      <ul className="space-y-2 lg:hidden">
        {list.map((inv) => (
          <li key={inv._id}>
            <Link href={`/factures/${inv._id}`} className="card flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">{inv.number}</div>
                <div className="truncate text-xs text-slate-500">{inv.client.name}</div>
                <div className="text-xs text-slate-400">
                  {formatDate(inv.createdAt)} · {inv.depot?.code} · {formatM2(inv.totalM2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-emerald-700">{formatCFA(inv.netTotal)}</div>
                {inv.breakageAmount > 0 && <div className="text-[11px] text-amber-700">casse -{formatCFA(inv.breakageAmount)}</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Bureau : tableau */}
      {list.length > 0 && (
        <div className="card hidden overflow-hidden lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">N° facture</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Dépôt</th>
                <th className="px-4 py-3">Règlement</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Casse</th>
                <th className="px-4 py-3 text-right">Net payé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((inv) => (
                <tr key={inv._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold">
                    <Link href={`/factures/${inv._id}`} className="text-slate-900 hover:text-brand-700">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{inv.client.name}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.depot?.code}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.paymentMethod}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatM2(inv.totalM2)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{inv.breakageAmount > 0 ? `-${formatCFA(inv.breakageAmount)}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCFA(inv.netTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
