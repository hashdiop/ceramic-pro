"use client";

import Link from "next/link";
import { useApi } from "@/lib/client/api";
import { formatCFA, formatDateTime, formatM2 } from "@/lib/units";
import type { InvoiceDTO } from "@/lib/types";
import { COMPANY } from "@/config/company";
import { ErrorBox, Spinner } from "@/components/ui";

export function InvoiceView({ id }: { id: string }) {
  const { data: inv, error, loading } = useApi<InvoiceDTO>(`/api/invoices/${id}`);

  if (error) return <ErrorBox message={error} />;
  if (loading || !inv) return <Spinner />;

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/factures" className="text-sm font-medium text-slate-600">
          ← Factures
        </Link>
        <div className="flex gap-2">
          <Link href="/vente" className="btn-ghost">
            Nouvelle vente
          </Link>
          <button type="button" onClick={() => window.print()} className="btn-primary">
            Imprimer / PDF
          </button>
        </div>
      </div>

      <article className="print-sheet card mx-auto max-w-3xl p-5 text-sm sm:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight text-slate-900">{COMPANY.name}</div>
            <p className="text-xs text-slate-500">{COMPANY.tagline}</p>
            <p className="text-xs text-slate-500">{COMPANY.address}</p>
            <p className="text-xs text-slate-500">Tél : {COMPANY.phone}</p>
            {(COMPANY.ninea || COMPANY.rccm) && (
              <p className="text-xs text-slate-500">
                {COMPANY.ninea && `NINEA : ${COMPANY.ninea}`} {COMPANY.rccm && `· RCCM : ${COMPANY.rccm}`}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <span className="inline-block rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800">Facture</span>
            <div className="mt-1.5 font-bold text-slate-900">{inv.number}</div>
            <div className="text-xs text-slate-500">{formatDateTime(inv.createdAt)}</div>
            <div className="text-xs text-slate-500">Dépôt : {inv.depot?.name}</div>
          </div>
        </header>

        <div className="my-5 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">Facturé à</div>
            <div className="font-bold text-slate-900">{inv.client.name}</div>
            <div className="text-xs text-slate-600">
              {inv.client.type}
              {inv.client.phone && ` · Tél : ${inv.client.phone}`}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[11px] font-semibold uppercase text-slate-400">Règlement</div>
            <div className="text-xs font-semibold text-slate-800">{inv.paymentMethod}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-[11px] uppercase text-slate-500">
                <th className="py-2">Désignation</th>
                <th className="py-2 text-center">Bain</th>
                <th className="py-2 text-center">Caisses</th>
                <th className="py-2 text-right">Surface</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-slate-800">{l.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {l.ref} · {l.motif} · {l.format} · {formatCFA(l.pricePerM2)}/m²
                    </div>
                  </td>
                  <td className="py-2.5 text-center text-slate-600">{l.lot}</td>
                  <td className="py-2.5 text-center font-bold text-slate-800">{l.boxes}</td>
                  <td className="py-2.5 text-right text-slate-600">{formatM2(l.billedM2)}</td>
                  <td className="py-2.5 text-right font-semibold text-slate-900">{formatCFA(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-5 max-w-sm space-y-2 border-t border-slate-200 pt-4 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Surface totale facturée</span>
            <span className="font-semibold">{formatM2(inv.totalM2)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Sous-total marchandise</span>
            <span className="font-semibold">{formatCFA(inv.subtotal)}</span>
          </div>
          {inv.breakage && inv.breakageAmount > 0 && (
            <div className="flex justify-between gap-2 rounded bg-amber-50 px-2.5 py-1.5 font-medium text-amber-700">
              <span>
                Report casse ({inv.breakage.quantity} {inv.breakage.unit === "caisses" ? "caisse(s)" : "m²"} — {inv.breakage.name})
              </span>
              <span>- {formatCFA(inv.breakageAmount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>NET À PAYER</span>
            <span>{formatCFA(inv.netTotal)}</span>
          </div>
        </div>

        <footer className="mt-8 border-t border-dashed border-slate-200 pt-4 text-center text-[11px] text-slate-400">
          Les carreaux sont vendus par caisse entière. Vérifiez la conformité des bains avant la pose.
        </footer>
      </article>
    </>
  );
}
