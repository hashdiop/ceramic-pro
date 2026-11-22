"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiPatch, apiPost, useApi } from "@/lib/client/api";
import { discardImage, uploadProductImage, type UploadedImage } from "@/lib/client/upload";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { tilesPerBox } from "@/lib/tiles";
import { formatCFA } from "@/lib/units";
import type { ProductDTO } from "@/lib/types";
import { Sheet } from "@/components/sheet";
import { Empty, ErrorBox, ProductThumb, Spinner } from "@/components/ui";

type Draft = {
  name: string;
  motif: string;
  format: string;
  m2PerBox: string;
  pricePerM2: string;
  minStockBoxes: string;
  imageUrl: string;
  imagePublicId: string;
};

const EMPTY: Draft = { name: "", motif: "", format: "", m2PerBox: "", pricePerM2: "", minStockBoxes: "10", imageUrl: "", imagePublicId: "" };

const toDraft = (p: ProductDTO): Draft => ({
  name: p.name,
  motif: p.motif,
  format: p.format,
  m2PerBox: String(p.m2PerBox),
  pricePerM2: String(p.pricePerM2),
  minStockBoxes: String(p.minStockBoxes),
  imageUrl: p.imageUrl ?? "",
  imagePublicId: p.imagePublicId ?? "",
});

/** "4 carreaux/cs" quand le calcul tombe juste, rien sinon. */
function tilesLabel(p: ProductDTO) {
  const t = tilesPerBox(p.m2PerBox, p.format);
  return t.kind === "exact" ? ` · ${t.tiles} carreaux/cs` : "";
}

export function ProductsAdmin({ readOnly = false }: { readOnly?: boolean }) {
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
        {!readOnly && (
          <button type="button" onClick={() => setEditing("new")} className="btn-accent">
            + Nouveau produit
          </button>
        )}
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
              onClick={() => !readOnly && setEditing(p)}
              disabled={readOnly}
              className={`card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand-500 ${p.active ? "" : "opacity-60"}`}
            >
              <ProductThumb src={p.imageUrl} alt={p.name} size="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{p.name}</span>
                  {!p.active && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Archivé</span>}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {p.ref} · {p.motif} · {p.format} · {p.m2PerBox} m²/cs{tilesLabel(p)}
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

function TilesHint({ m2PerBox, format }: { m2PerBox: string; format: string }) {
  const t = tilesPerBox(Number(m2PerBox), format);
  if (t.kind === "unknown") return null;
  return (
    <div className="col-span-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
      {t.kind === "exact" ? (
        <>
          Soit <strong className="text-slate-900">{t.tiles} carreaux</strong> par caisse (calculé, à titre indicatif).
        </>
      ) : (
        <>
          Nombre de carreaux non calculable exactement (≈ {t.approx.toLocaleString("fr-FR")}) : le format est sans doute nominal. Sans effet
          sur les calculs, qui utilisent les m²/caisse.
        </>
      )}
    </div>
  );
}

function ImageField({
  url,
  name,
  disabled,
  onUploaded,
  onRemove,
}: {
  url: string;
  name: string;
  disabled: boolean;
  onUploaded: (img: UploadedImage) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      onUploaded(await uploadProductImage(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'envoi");
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;
  return (
    <div>
      <span className="label">Photo</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || uploading}
          className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand-500"
          aria-label={url ? "Changer la photo" : "Ajouter une photo"}
        >
          {url ? <ProductThumb src={url} alt={name || "Photo"} size="h-full w-full" px={96} /> : <span className="text-3xl leading-none">+</span>}
          {uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm font-bold text-slate-700">{progress}%</span>}
        </button>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <button type="button" onClick={() => input.current?.click()} disabled={disabled || uploading} className="btn-ghost min-h-9 px-3 text-sm">
            {uploading ? "Envoi…" : url ? "Changer la photo" : "Ajouter une photo"}
          </button>
          {url && !uploading && (
            <button type="button" onClick={onRemove} disabled={disabled} className="text-xs font-medium text-red-600">
              Retirer la photo
            </button>
          )}
          <span className="text-[11px] text-slate-400">JPG, PNG, WebP · réduite automatiquement avant l&apos;envoi</span>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
    </div>
  );
}

function ProductForm({ product, motifs, onDone }: { product: ProductDTO | null; motifs: string[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(product ? toDraft(product) : EMPTY);
  const [busy, setBusy] = useState<null | "save" | "toggle">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  // Image envoyée pendant cette édition mais pas encore enregistrée sur le produit :
  // supprimée de Cloudinary si on la remplace ou si on ferme sans enregistrer.
  const pending = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pending.current) discardImage(pending.current);
    },
    [],
  );

  function imageUploaded(img: UploadedImage) {
    if (pending.current) discardImage(pending.current);
    pending.current = img.publicId;
    setD((x) => ({ ...x, imageUrl: img.url, imagePublicId: img.publicId }));
  }
  function imageRemoved() {
    if (pending.current) discardImage(pending.current);
    pending.current = null;
    setD((x) => ({ ...x, imageUrl: "", imagePublicId: "" }));
  }

  const payload = () => ({
    name: d.name,
    motif: d.motif,
    format: d.format,
    m2PerBox: Number(d.m2PerBox),
    pricePerM2: Number(d.pricePerM2),
    minStockBoxes: Number(d.minStockBoxes || 0),
    imageUrl: d.imageUrl,
    imagePublicId: d.imagePublicId,
  });

  async function run(kind: "save" | "toggle", fn: () => Promise<unknown>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
      if (kind === "save") pending.current = null; // l'image appartient désormais au produit
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
      <ImageField url={d.imageUrl} name={d.name} disabled={busy !== null} onUploaded={imageUploaded} onRemove={imageRemoved} />

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
          <span className="text-slate-500">Référence</span>
          <span className="font-semibold text-slate-900">{product ? product.ref : "attribuée automatiquement"}</span>
        </div>
        <label className="col-span-2">
          <span className="label">Désignation *</span>
          <input value={d.name} onChange={set("name")} required className="input" placeholder="Calacatta Gold Poli" />
        </label>
        <label className="col-span-2">
          <span className="label">Motif *</span>
          <input value={d.motif} onChange={set("motif")} required list="motifs" className="input" placeholder="Effet Marbre" />
          <datalist id="motifs">
            {motifs.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="label">Format (cm) *</span>
          <input value={d.format} onChange={set("format")} required className="input" placeholder="60x60" />
        </label>
        <label>
          <span className="label">m² par caisse *</span>
          <input value={d.m2PerBox} onChange={set("m2PerBox")} required type="number" inputMode="decimal" step="0.0001" min="0.0001" className="input" />
        </label>
        <TilesHint m2PerBox={d.m2PerBox} format={d.format} />
        {product && product.m2PerBox !== Number(d.m2PerBox) && d.m2PerBox && (
          <p className="col-span-2 text-xs font-medium text-amber-700">
            Attention : le stock est compté en caisses ; changer les m²/caisse modifie la surface du stock existant.
          </p>
        )}
        <label>
          <span className="label">Prix au m² (FCFA) *</span>
          <input value={d.pricePerM2} onChange={set("pricePerM2")} required type="number" inputMode="numeric" step="1" min="0" className="input" />
        </label>
        <label>
          <span className="label">Seuil d&apos;alerte (cs)</span>
          <input value={d.minStockBoxes} onChange={set("minStockBoxes")} type="number" inputMode="numeric" step="1" min="0" className="input" />
        </label>
      </div>

      <p className="text-[11px] text-slate-400">
        {product
          ? "Les factures déjà émises gardent le prix et la désignation de l'époque."
          : "Le stock se crée ensuite via Stock → Opération → Entrée fournisseur."}
      </p>

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
