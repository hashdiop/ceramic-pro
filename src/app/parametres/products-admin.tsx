"use client";

import { useMemo, useState } from "react";
import { apiPatch, apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatCFA } from "@/lib/units";
import type { ProductDTO } from "@/lib/types";
import { Sheet } from "@/components/sheet";
import { Empty, ErrorBox, ProductThumb, Spinner } from "@/components/ui";

type Draft = {
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: string;
  pricePerM2: string;
  minStockBoxes: string;
  imageUrl: string;
};

const EMPTY: Draft = { ref: "", name: "", motif: "", format: "", m2PerBox: "", pricePerM2: "", minStockBoxes: "10", imageUrl: "" };

const toDraft = (p: ProductDTO): Draft => ({
  ref: p.ref,
  name: p.name,
  motif: p.motif,
  format: p.format,
  m2PerBox: String(p.m2PerBox),
  pricePerM2: String(p.pricePerM2),
  minStockBoxes: String(p.minStockBoxes),
  imageUrl: p.imageUrl ?? "",
});

/** "60x60 cm", "20 x 120", "45X90cm" → [60, 60] (en cm). */
function parseFormat(format: string): [number, number] | null {
  const m = format.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function ProductsAdmin() {
  const { data, error, loading } = useApi<ProductDTO[]>("/api/products?all=1", [REALTIME_EVENTS.catalog]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ProductDTO | "new" | null>(null);

  const motifs = useMemo(() => [...new Set((data ?? []).map((p) => p.motif))].sort(), [data]);
  const list = (data ?? []).filter(
    (p) => (showArchived || p.active) && (!q || `${p.name} ${p.ref} ${p.motif} ${p.format}`.toLowerCase().includes(q.toLowerCase())),
  );
  const archivedCount = (data ?? []).filter((p) => !p.active).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" className="input min-w-0 flex-1" />
        <button type="button" onClick={() => setEditing("new")} className="btn-accent">
          + Nouveau produit
        </button>
      </div>
      {archivedCount > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-5 w-5 accent-slate-900" />
          Afficher les produits archivés ({archivedCount})
        </label>
      )}

      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && list.length === 0 && <Empty>Aucun produit.</Empty>}

      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {list.map((p) => (
          <li key={p._id}>
            <button
              type="button"
              onClick={() => setEditing(p)}
              className={`card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand-500 ${p.active ? "" : "opacity-60"}`}
            >
              <ProductThumb src={p.imageUrl} alt={p.name} size="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{p.name}</span>
                  {!p.active && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Archivé</span>}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {p.ref} · {p.motif} · {p.format} · {p.m2PerBox} m²/cs
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-brand-700">{formatCFA(p.pricePerM2)}</div>
                <div className="text-[11px] text-slate-500">seuil {p.minStockBoxes} cs</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={editing !== null} title={editing === "new" ? "Nouveau produit" : "Modifier le produit"} onClose={() => setEditing(null)}>
        {editing !== null && (
          <ProductForm
            key={editing === "new" ? "new" : editing._id}
            product={editing === "new" ? null : editing}
            motifs={motifs}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function ProductForm({ product, motifs, onDone }: { product: ProductDTO | null; motifs: string[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(product ? toDraft(product) : EMPTY);
  const [tilesPerBox, setTilesPerBox] = useState("");
  const [busy, setBusy] = useState<null | "save" | "toggle">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  const dims = parseFormat(d.format);
  const tileM2 = dims ? (dims[0] * dims[1]) / 10000 : null;
  const computedM2 = tileM2 && Number(tilesPerBox) > 0 ? Math.round(tileM2 * Number(tilesPerBox) * 10000) / 10000 : null;

  const payload = () => ({
    ref: d.ref,
    name: d.name,
    motif: d.motif,
    format: d.format,
    m2PerBox: Number(d.m2PerBox),
    pricePerM2: Number(d.pricePerM2),
    minStockBoxes: Number(d.minStockBoxes || 0),
    imageUrl: d.imageUrl,
  });

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
    run("save", () => (product ? apiPatch(`/api/products/${product._id}`, payload()) : apiPost("/api/products", payload())));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <ProductThumb src={d.imageUrl} alt={d.name || "Aperçu"} size="h-16 w-16" />
        <div className="text-xs text-slate-500">
          {product ? (
            <>
              Les factures déjà émises gardent le prix et la désignation de l&apos;époque.
              {product.m2PerBox !== Number(d.m2PerBox) && d.m2PerBox && (
                <span className="mt-1 block font-medium text-amber-700">
                  Attention : le stock est compté en caisses ; changer les m²/caisse modifie la surface du stock existant.
                </span>
              )}
            </>
          ) : (
            "Le stock se crée ensuite via Stock → Opération → Entrée fournisseur."
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Référence *</span>
          <input value={d.ref} onChange={set("ref")} required className="input uppercase" placeholder="REF-09" />
        </label>
        <label>
          <span className="label">Motif *</span>
          <input value={d.motif} onChange={set("motif")} required list="motifs" className="input" placeholder="Effet Marbre" />
          <datalist id="motifs">
            {motifs.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="col-span-2">
          <span className="label">Désignation *</span>
          <input value={d.name} onChange={set("name")} required className="input" placeholder="Calacatta Gold Poli" />
        </label>
        <label>
          <span className="label">Format *</span>
          <input value={d.format} onChange={set("format")} required className="input" placeholder="60x60 cm" />
        </label>
        <label>
          <span className="label">m² par caisse *</span>
          <input value={d.m2PerBox} onChange={set("m2PerBox")} required type="number" inputMode="decimal" step="0.0001" min="0.0001" className="input" />
        </label>
      </div>

      {tileM2 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">
            Calcul : 1 carreau {dims![0]}×{dims![1]} cm = {tileM2.toLocaleString("fr-FR")} m²
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="label">Carreaux par caisse</span>
              <input value={tilesPerBox} onChange={(e) => setTilesPerBox(e.target.value)} type="number" inputMode="numeric" min="1" className="input" />
            </label>
            <button
              type="button"
              disabled={!computedM2}
              onClick={() => computedM2 && setD({ ...d, m2PerBox: String(computedM2) })}
              className="btn-ghost"
            >
              {computedM2 ? `Appliquer ${computedM2.toLocaleString("fr-FR")} m²` : "Appliquer"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Prix au m² (FCFA) *</span>
          <input value={d.pricePerM2} onChange={set("pricePerM2")} required type="number" inputMode="numeric" step="1" min="0" className="input" />
        </label>
        <label>
          <span className="label">Seuil d&apos;alerte (cs)</span>
          <input value={d.minStockBoxes} onChange={set("minStockBoxes")} type="number" inputMode="numeric" step="1" min="0" className="input" />
        </label>
        <label className="col-span-2">
          <span className="label">URL de l&apos;image</span>
          <input value={d.imageUrl} onChange={set("imageUrl")} className="input" placeholder="/tiles/ref-09.svg ou https://res.cloudinary.com/…" />
          <span className="mt-1 block text-[11px] text-slate-400">L&apos;envoi direct de photos se fera via Cloudinary (prévu, non activé).</span>
        </label>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="submit" disabled={busy !== null} className="btn-primary sm:flex-1">
          {busy === "save" ? "Enregistrement…" : product ? "Enregistrer" : "Créer le produit"}
        </button>
        {product && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("toggle", () => apiPatch(`/api/products/${product._id}`, { active: !product.active }))}
            className={product.active ? "btn-danger sm:flex-1" : "btn-ghost sm:flex-1"}
          >
            {busy === "toggle" ? "Traitement…" : product.active ? "Archiver" : "Réactiver"}
          </button>
        )}
      </div>
    </form>
  );
}
