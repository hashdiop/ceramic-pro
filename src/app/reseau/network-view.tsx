"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/client/api";
import { telHref, transferRequestMessage, whatsappHref } from "@/lib/contact";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { NetworkDepotDTO, ProductStockDTO } from "@/lib/types";
import { useAuth } from "@/components/auth-context";
import { useDepots } from "@/components/depot-context";
import { ProductModal } from "@/components/product-modal";
import { Chips, Empty, ErrorBox, GlobalStockBadge, PageHeader, ProductThumb, Spinner } from "@/components/ui";

const VIEWS = [
  { key: "depots", label: "Dépôts" },
  { key: "produits", label: "Produits" },
] as const;
const FILTERS = ["Tous", "Alertes"] as const;

/**
 * Réseau : chaque responsable consulte le stock des autres dépôts et joint leur responsable
 * (appel ou WhatsApp) pour demander un transfert, de façon informelle. Le transfert lui-même
 * est ensuite saisi par le dépôt qui expédie, et tracé au journal.
 */
export function NetworkView() {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("vue") === "produits" ? "produits" : "depots";
  const stock = useApi<ProductStockDTO[]>("/api/stock/products", [REALTIME_EVENTS.stock, REALTIME_EVENTS.catalog]);
  const network = useApi<NetworkDepotDTO[]>("/api/network", [REALTIME_EVENTS.catalog]);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Réseau des dépôts" subtitle="Stock des autres dépôts et contact de leurs responsables" />
      <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/70 p-1 sm:inline-grid sm:w-80">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => router.replace(`/reseau?vue=${v.key}`, { scroll: false })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === v.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {(stock.error || network.error) && <ErrorBox message={stock.error || network.error || ""} />}
      {(!stock.data || !network.data) && !stock.error && !network.error && <Spinner />}
      {stock.data && network.data &&
        (view === "depots" ? (
          <DepotsView stock={stock.data} network={network.data} onOpen={setDetail} />
        ) : (
          <ProductsView stock={stock.data} onOpen={setDetail} initialFilter={params.get("filtre") === "alertes" ? "Alertes" : "Tous"} />
        ))}
      <ProductModal productId={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/* ---------------------------------- Dépôts ---------------------------------- */

function DepotsView({ stock, network, onOpen }: { stock: ProductStockDTO[]; network: NetworkDepotDTO[]; onOpen: (id: string) => void }) {
  const { canWrite, isAdmin } = useAuth();
  const { depots } = useDepots();
  const [expanded, setExpanded] = useState<string | null>(null);
  const myName = depots.find((d) => canWrite(d._id))?.name ?? "";
  // Pour un responsable : les autres dépôts d'abord, le sien en dernier.
  const ordered = [...network].sort((a, b) => Number(!isAdmin && canWrite(a._id)) - Number(!isAdmin && canWrite(b._id)));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {ordered.map((d) => {
        const mine = !isAdmin && canWrite(d._id);
        const rows = stock.map((p) => ({ p, s: p.depots.find((x) => x.depotId === d._id) })).filter((r) => r.s && r.s.availableBoxes > 0);
        const total = rows.reduce((sum, r) => sum + (r.s?.availableBoxes ?? 0), 0);
        const alerts = stock.filter((p) => p.depots.find((x) => x.depotId === d._id)?.status !== "OK").length;
        const open = expanded === d._id;
        return (
          <section key={d._id} className={`card p-4 ${mine ? "ring-1 ring-brand-300" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-slate-900">{d.name}</h2>
                <p className="truncate text-xs text-slate-500">
                  {d.code}
                  {d.address && ` · ${d.address}`}
                </p>
              </div>
              {mine && <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Mon dépôt</span>}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Mini label="Produits dispo" value={rows.length} />
              <Mini label="Caisses dispo" value={total} />
              <Mini label="Alertes" value={alerts} tone={alerts ? "text-amber-700" : undefined} />
            </div>

            {!mine && <Contacts depot={d} myName={myName} />}

            <button type="button" onClick={() => setExpanded(open ? null : d._id)} className="btn-ghost mt-3 w-full text-sm">
              {open ? "Masquer le stock" : `Voir le stock (${rows.length})`}
            </button>
            {open && (
              <ul className="mt-2 divide-y divide-slate-100">
                {rows.length === 0 && <Empty>Aucun produit disponible.</Empty>}
                {rows.map(({ p, s }) => (
                  <li key={p.productId}>
                    <button type="button" onClick={() => onOpen(p.productId)} className="flex w-full items-center gap-3 py-2 text-left">
                      <ProductThumb src={p.imageUrl} alt={p.name} size="h-10 w-10" px={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{p.name}</div>
                        <div className="truncate text-[11px] text-slate-500">
                          {p.ref} · {s!.lots.map((l) => `${l.lot} : ${l.availableBoxes}`).join(" · ")}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-900">{s!.availableBoxes} cs</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Responsables du dépôt (ou téléphone du dépôt) avec appel et WhatsApp. */
function Contacts({ depot, myName }: { depot: NetworkDepotDTO; myName: string }) {
  const people = depot.managers.length ? depot.managers : [{ name: "", phone: depot.phone }];
  const usable = people.filter((m) => m.phone);
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase text-slate-400">Responsable</div>
      {usable.length === 0 && (
        <p className="text-xs text-slate-500">
          {depot.managers.map((m) => m.name).join(", ") || "Aucun responsable"} · pas de numéro renseigné (à ajouter par l&apos;administrateur).
        </p>
      )}
      {usable.map((m) => (
        <div key={m.name + m.phone}>
          <div className="text-sm font-semibold text-slate-800">
            {m.name || "Standard du dépôt"} <span className="font-normal text-slate-500">· {m.phone}</span>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <a href={telHref(m.phone)} className="btn-ghost min-h-9 flex-1 px-2 text-xs">
              📞 Appeler
            </a>
            <a
              href={whatsappHref(m.phone, transferRequestMessage({ to: m.name, from: myName || "…" }))}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-success min-h-9 flex-1 px-2 text-xs"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Produits --------------------------------- */

function ProductsView({ stock, onOpen, initialFilter }: { stock: ProductStockDTO[]; onOpen: (id: string) => void; initialFilter: (typeof FILTERS)[number] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(initialFilter);
  const list = useMemo(
    () =>
      stock.filter(
        (p) =>
          (filter === "Tous" || p.status !== "OK") &&
          (!q || `${p.name} ${p.ref} ${p.motif} ${p.format}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [stock, q, filter],
  );

  return (
    <>
      <div className="mb-3 space-y-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qui a du… ? (nom, référence, motif)" className="input" />
        <Chips options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {list.length === 0 && <Empty>Aucun produit.</Empty>}
      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {list.map((p) => (
          <li key={p.productId}>
            <button type="button" onClick={() => onOpen(p.productId)} className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand-500">
              <ProductThumb src={p.imageUrl} alt={p.name} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{p.name}</span>
                </div>
                <div className="truncate text-xs text-slate-500">
                  {p.ref} · {p.format}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.depots.map((d) => (
                    <span
                      key={d.depotId}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        d.availableBoxes <= 0 ? "bg-red-50 text-red-600" : d.status === "BAS" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {d.depotCode} {d.availableBoxes}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-bold text-slate-900">{p.availableBoxes} cs</div>
                <GlobalStockBadge status={p.status} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2">
      <div className={`text-lg font-bold ${tone ?? "text-slate-900"}`}>{value}</div>
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
    </div>
  );
}
