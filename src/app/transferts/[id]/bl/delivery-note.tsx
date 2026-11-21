"use client";

import Link from "next/link";
import { useApi } from "@/lib/client/api";
import { formatDateTime, formatM2, m2ForBoxes } from "@/lib/units";
import type { TransferDTO } from "@/lib/types";
import { COMPANY } from "@/config/company";
import { ErrorBox, Spinner } from "@/components/ui";

/** Bon de livraison inter-dépôts, imprimable en A4. */
export function DeliveryNote({ id }: { id: string }) {
  const { data: t, error, loading } = useApi<TransferDTO>(`/api/transfers/${id}`);
  if (error) return <ErrorBox message={error} />;
  if (loading || !t) return <Spinner />;

  const received = t.status === "RECU";
  const totalBoxes = t.lines.reduce((s, l) => s + l.sentBoxes, 0);
  const totalM2 = t.lines.reduce((s, l) => s + m2ForBoxes(l.sentBoxes, l.m2PerBox), 0);

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link href={`/transferts/${t._id}`} className="text-sm font-medium text-slate-600">
          ← {t.number}
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Imprimer / PDF
        </button>
      </div>

      <article className="print-sheet card mx-auto max-w-3xl p-5 text-sm sm:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight text-slate-900">{COMPANY.name}</div>
            <p className="text-xs text-slate-500">{COMPANY.address}</p>
            <p className="text-xs text-slate-500">Tél : {COMPANY.phone}</p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800">
              Bon de livraison
            </span>
            <div className="mt-1.5 font-bold text-slate-900">BL-{t.number}</div>
            <div className="text-xs text-slate-500">Émis le {formatDateTime(t.sentAt)}</div>
            <div className="text-xs font-semibold text-slate-600">
              Statut : {t.status === "EN_TRANSIT" ? "En transit" : received ? "Reçu" : "Annulé"}
            </div>
          </div>
        </header>

        <div className="my-5 grid gap-3 sm:grid-cols-2">
          <Party title="Expéditeur" name={t.fromDepot?.name} address={t.fromDepot?.address} phone={t.fromDepot?.phone} />
          <Party title="Destinataire" name={t.toDepot?.name} address={t.toDepot?.address} phone={t.toDepot?.phone} />
        </div>

        {(t.driver || t.vehicle) && (
          <p className="mb-4 text-xs text-slate-600">
            {t.driver && <>Chauffeur : <strong>{t.driver}</strong> </>}
            {t.vehicle && <>· Véhicule : <strong>{t.vehicle}</strong></>}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-[11px] uppercase text-slate-500">
                <th className="py-2">Réf.</th>
                <th className="py-2">Désignation</th>
                <th className="py-2 text-center">Bain</th>
                <th className="py-2 text-center">Caisses</th>
                <th className="py-2 text-right">Surface</th>
                <th className="py-2 text-center">{received ? "Reçues" : "Reçues (à remplir)"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.lines.map((l) => (
                <tr key={l._id}>
                  <td className="py-2.5 text-slate-600">{l.ref}</td>
                  <td className="py-2.5">
                    <div className="font-semibold text-slate-800">{l.name}</div>
                    <div className="text-[11px] text-slate-500">{l.format}</div>
                  </td>
                  <td className="py-2.5 text-center">{l.lot}</td>
                  <td className="py-2.5 text-center font-bold">{l.sentBoxes}</td>
                  <td className="py-2.5 text-right">{formatM2(m2ForBoxes(l.sentBoxes, l.m2PerBox))}</td>
                  <td className="py-2.5 text-center">{received ? l.receivedBoxes : <span className="inline-block h-5 w-12 border-b border-slate-400" />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold">
                <td colSpan={3} className="py-2">
                  Total
                </td>
                <td className="py-2 text-center">{totalBoxes}</td>
                <td className="py-2 text-right">{formatM2(totalM2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {t.note && <p className="mt-4 text-xs text-slate-600">Note : {t.note}</p>}

        <div className="mt-10 grid grid-cols-3 gap-4 text-center text-[11px] text-slate-500">
          {["Expéditeur", "Chauffeur", "Réceptionnaire"].map((s) => (
            <div key={s}>
              <div className="mb-12 font-semibold uppercase">{s}</div>
              <div className="border-t border-slate-300 pt-1">Nom & signature</div>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

function Party({ title, name, address, phone }: { title: string; name?: string; address?: string; phone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{title}</div>
      <div className="font-bold text-slate-900">{name}</div>
      {address && <div className="text-xs text-slate-600">{address}</div>}
      {phone && <div className="text-xs text-slate-600">Tél : {phone}</div>}
    </div>
  );
}
