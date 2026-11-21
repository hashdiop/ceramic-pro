"use client";

import Link from "next/link";
import { useState } from "react";
import { apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { AvailableLotDTO, ProductDTO } from "@/lib/types";
import { useDepots } from "@/components/depot-context";
import { ErrorBox, PageHeader } from "@/components/ui";

const TYPES = [
  { value: "ENTREE", label: "Entrée fournisseur", hint: "Ajoute des caisses au stock (nouveau bain ou bain existant)." },
  { value: "AJUSTEMENT", label: "Ajustement d'inventaire", hint: "Corrige l'écart après comptage : + ou − caisses." },
  { value: "CASSE", label: "Casse en dépôt", hint: "Retire des caisses cassées dans le dépôt." },
] as const;

export function StockOperationForm() {
  const { depots, currentDepotId } = useDepots();
  const products = useApi<ProductDTO[]>("/api/products", [REALTIME_EVENTS.catalog]);

  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("ENTREE");
  const [depotId, setDepotId] = useState("");
  const [productId, setProductId] = useState("");
  const [lot, setLot] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const effectiveDepot = depotId || currentDepotId;
  const effectiveProduct = productId || products.data?.[0]?._id || "";
  const lots = useApi<AvailableLotDTO[]>(effectiveDepot ? `/api/stock/lots?depotId=${effectiveDepot}` : null, [REALTIME_EVENTS.stock]);
  const productLots = (lots.data ?? []).filter((l) => l.productId === effectiveProduct);
  const product = products.data?.find((p) => p._id === effectiveProduct);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      await apiPost("/api/stock/movements", {
        type,
        depotId: effectiveDepot,
        productId: effectiveProduct,
        lot,
        quantityBoxes: qty,
        note,
      });
      const depot = depots.find((d) => d._id === effectiveDepot);
      setDone(`Opération enregistrée : ${type === "ENTREE" ? "+" : type === "CASSE" ? "−" : qty > 0 ? "+" : ""}${Math.abs(qty)} cs ${product?.name} (bain ${lot.toUpperCase()}) — ${depot?.name}.`);
      setQty(1);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const current = TYPES.find((t) => t.value === type)!;

  return (
    <>
      <PageHeader title="Opération de stock" subtitle="Chaque opération est inscrite au journal des mouvements" />
      <form onSubmit={submit} className="card mx-auto max-w-xl space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${type === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{current.hint}</p>

        <label className="block">
          <span className="label">Dépôt</span>
          <select value={effectiveDepot} onChange={(e) => setDepotId(e.target.value)} className="input" required>
            {depots.map((d) => (
              <option key={d._id} value={d._id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Article</span>
          <select value={effectiveProduct} onChange={(e) => setProductId(e.target.value)} className="input" required>
            {(products.data ?? []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} — {p.ref}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Bain (lot)</span>
            <input value={lot} onChange={(e) => setLot(e.target.value)} list="lots" placeholder="ex. B2611A" className="input uppercase" required />
            <datalist id="lots">
              {productLots.map((l) => (
                <option key={l.lot} value={l.lot}>
                  {l.availableBoxes} cs dispo
                </option>
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="label">{type === "AJUSTEMENT" ? "Variation (+/− caisses)" : "Caisses"}</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={type === "AJUSTEMENT" ? undefined : 1}
              value={qty}
              onChange={(e) => setQty(Math.trunc(Number(e.target.value)))}
              className="input"
              required
            />
          </label>
        </div>

        {productLots.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {productLots.map((l) => (
              <button key={l.lot} type="button" onClick={() => setLot(l.lot)} className="chip bg-slate-100 text-slate-700 hover:bg-slate-200">
                {l.lot} · {l.availableBoxes} cs
              </button>
            ))}
          </div>
        )}

        <label className="block">
          <span className="label">Note (optionnel)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="N° BL fournisseur, motif de l'ajustement…" className="input" />
        </label>

        {error && <ErrorBox message={error} />}
        {done && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</div>}

        <div className="flex gap-2">
          <Link href="/stock" className="btn-ghost flex-1">
            Retour au stock
          </Link>
          <button type="submit" disabled={saving || !effectiveDepot || !effectiveProduct || !lot || qty === 0} className="btn-primary flex-1">
            {saving ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </form>
    </>
  );
}
