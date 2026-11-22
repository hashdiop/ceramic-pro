"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { telHref, transferRequestMessage, whatsappHref } from "@/lib/contact";
import { imageUrl } from "@/lib/images";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { tilesPerBox } from "@/lib/tiles";
import { formatCFA, formatM2, m2ForBoxes } from "@/lib/units";
import type { NetworkDepotDTO, ProductStockDTO } from "@/lib/types";
import { useAuth } from "./auth-context";
import { useDepots } from "./depot-context";
import { Sheet } from "./sheet";
import { ErrorBox, GlobalStockBadge, Spinner, StockBadge } from "./ui";

/**
 * Fiche produit : grande photo (pour distinguer des carreaux ressemblants), caractéristiques,
 * statut global et répartition du stock par dépôt et par bain, avec contact des autres dépôts.
 */
export function ProductModal({
  productId,
  onClose,
  actions,
}: {
  productId: string | null;
  onClose: () => void;
  /** Boutons propres à la page (ex. « Ajouter au panier »). */
  actions?: (p: ProductStockDTO) => React.ReactNode;
}) {
  const open = productId !== null;
  const stock = useApi<ProductStockDTO[]>(open ? "/api/stock/products" : null, [
    REALTIME_EVENTS.stock,
    REALTIME_EVENTS.catalog,
  ]);
  const p = stock.data?.find((x) => x.productId === productId);

  return (
    <Sheet open={open} title={p ? p.ref : "Fiche produit"} onClose={onClose}>
      {stock.error && <ErrorBox message={stock.error} />}
      {!p && !stock.error && <Spinner />}
      {p && <ProductDetail p={p} actions={actions} />}
    </Sheet>
  );
}

function ProductDetail({
  p,
  actions,
}: {
  p: ProductStockDTO;
  actions?: (p: ProductStockDTO) => React.ReactNode;
}) {
  const [zoom, setZoom] = useState(false);
  const tiles = tilesPerBox(p.m2PerBox, p.format);
  const maxAvail = Math.max(1, ...p.depots.map((d) => d.availableBoxes));

  return (
    <div className="space-y-4">
      {/* Photo en grand : c'est elle qui évite de confondre deux carreaux proches. */}
      <button
        type="button"
        onClick={() => p.imageUrl && setZoom(true)}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-200"
        aria-label={p.imageUrl ? "Agrandir la photo" : "Pas de photo"}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(p.imageUrl, 420, "contain")}
            alt={p.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-slate-500">
            Pas de photo
          </span>
        )}
        {p.imageUrl && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
            🔍 Agrandir
          </span>
        )}
      </button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-sm font-bold tracking-wide text-white">
            {p.ref}
          </span>
          <GlobalStockBadge status={p.status} />
        </div>
        <h3 className="mt-2 text-xl font-bold leading-tight text-slate-900">
          {p.name}
        </h3>
        <p className="text-sm text-slate-500">{p.motif}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Spec
          label="Format"
          value={/cm/i.test(p.format) ? p.format : `${p.format} cm`}
        />
        <Spec label="Prix" value={`${formatCFA(p.pricePerM2)} / m²`} strong />
        <Spec
          label="Par caisse"
          value={`${p.m2PerBox.toLocaleString("fr-FR")} m²`}
        />
        <Spec
          label="Carreaux / caisse"
          value={tiles.kind === "exact" ? String(tiles.tiles) : "—"}
        />
      </dl>

      <section className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4 className="section-title">Stock réseau</h4>
          <span className="text-xs text-slate-500">
            seuil global {p.globalMinBoxes} cs · min. {p.minDepotBoxes} cs /
            dépôt
          </span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Total
            label="Disponible"
            value={p.availableBoxes}
            sub={formatM2(m2ForBoxes(p.availableBoxes, p.m2PerBox))}
            strong
          />
          <Total label="Réservé" value={p.reservedBoxes} sub="en départ" />
          <Total label="En route" value={p.incomingBoxes} sub="à recevoir" />
        </div>
        <DepotBreakdown p={p} maxAvail={maxAvail} />
      </section>

      {actions && <div className="flex flex-col gap-2">{actions(p)}</div>}

      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3"
          aria-label="Fermer la photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(p.imageUrl, 800, "contain")}
            alt={p.name}
            className="max-h-full max-w-full object-contain"
          />
          <span className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white">
            Fermer ✕
          </span>
        </button>
      )}
    </div>
  );
}

/** Répartition par dépôt et par bain ; les dépôts des autres affichent de quoi joindre leur responsable. */
function DepotBreakdown({
  p,
  maxAvail,
}: {
  p: ProductStockDTO;
  maxAvail: number;
}) {
  const { canWrite, user } = useAuth();
  const { depots } = useDepots();
  const network = useApi<NetworkDepotDTO[]>("/api/network");
  const myDepot =
    depots.find((d) => user?.depotIds.includes(d._id))?.name ?? "";

  return (
    <ul className="space-y-2.5">
      {p.depots.map((d) => {
        const mine = canWrite(d.depotId) && user?.role !== "ADMIN";
        const info = network.data?.find((n) => n._id === d.depotId);
        const manager =
          info?.managers.find((m) => m.phone) ?? info?.managers[0];
        const phone = manager?.phone || info?.phone || "";
        const showContact =
          !canWrite(d.depotId) && d.availableBoxes > 0 && phone;
        const bestLot = d.lots[0]?.lot;
        return (
          <li
            key={d.depotId}
            className={`rounded-xl p-2.5 ${mine ? "bg-brand-50 ring-1 ring-brand-200" : "bg-slate-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-slate-800">
                  {d.depotName}
                </span>
                {mine && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase text-brand-700">
                    mon dépôt
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">
                  {d.availableBoxes} cs
                </span>
                <StockBadge status={d.status} />
              </div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${(Math.max(0, d.availableBoxes) / maxAvail) * 100}%`,
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {d.lots.length > 0
                ? d.lots
                    .map((l) => `bain ${l.lot} : ${l.availableBoxes} cs`)
                    .join(" · ")
                : "Aucun bain en stock"}
              {d.reservedBoxes > 0 && ` · ${d.reservedBoxes} réservées`}
              {d.incomingBoxes > 0 && ` · ${d.incomingBoxes} en route`}
            </div>
            {showContact && (
              <>
                <div className="mt-2 text-[11px] text-slate-600">
                  {manager?.name || "Standard du dépôt"} ·{" "}
                  <span className="font-semibold">{phone}</span>
                </div>
                <div className="mt-1 flex gap-1.5">
                  <a
                    href={telHref(phone)}
                    className="btn-ghost min-h-9 flex-1 px-2 text-xs"
                  >
                    📞 Appeler
                  </a>
                  <a
                    href={whatsappHref(
                      phone,
                      transferRequestMessage({
                        to: manager?.name,
                        from: myDepot || "…",
                        product: p,
                        lot: bestLot,
                      }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-success min-h-9 flex-1 px-2 text-xs"
                  >
                    💬 Demander (WhatsApp)
                  </a>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Spec({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd
        className={
          strong ? "font-bold text-brand-700" : "font-semibold text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Total({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: number;
  sub: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2">
      <div
        className={`text-lg font-bold ${strong ? "text-emerald-700" : "text-slate-800"}`}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
