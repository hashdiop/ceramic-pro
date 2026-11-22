"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatM2, m2ForBoxes } from "@/lib/units";
import type { AvailableLotDTO, ProductDTO, TransferDTO } from "@/lib/types";
import { useDepots } from "@/components/depot-context";
import { useAuth } from "@/components/auth-context";
import { Empty, ErrorBox, PageHeader } from "@/components/ui";

interface Line {
  key: number;
  productId: string;
  lot: string;
  boxes: number;
}

export function NewTransferForm() {
  const router = useRouter();
  const { depots, currentDepotId } = useDepots();
  const { canWrite } = useAuth();
  // Le transfert est déclaré par le dépôt expéditeur : seuls ses propres dépôts peuvent expédier.
  const sourceDepots = depots.filter((d) => canWrite(d._id));
  const products = useApi<ProductDTO[]>("/api/products", [REALTIME_EVENTS.catalog]);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState({ productId: "", lot: "", boxes: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = fromId || (sourceDepots.some((d) => d._id === currentDepotId) ? currentDepotId : (sourceDepots[0]?._id ?? ""));
  const to = toId || depots.find((d) => d._id !== from)?._id || "";
  const lots = useApi<AvailableLotDTO[]>(from ? `/api/stock/lots?depotId=${from}` : null, [REALTIME_EVENTS.stock]);
  const productMap = useMemo(() => new Map((products.data ?? []).map((p) => [p._id, p])), [products.data]);

  // Articles disponibles au dépôt source uniquement.
  const availableProducts = useMemo(() => {
    const ids = new Set((lots.data ?? []).map((l) => l.productId));
    return (products.data ?? []).filter((p) => ids.has(p._id));
  }, [lots.data, products.data]);

  const pickerProduct = picker.productId || availableProducts[0]?._id || "";
  const pickerLots = (lots.data ?? []).filter((l) => l.productId === pickerProduct);
  const pickerLot = picker.lot || pickerLots[0]?.lot || "";

  /** Caisses encore disponibles pour un bain, compte tenu des lignes déjà saisies. */
  const remaining = (productId: string, lot: string, excludeKey?: number) => {
    const avail = (lots.data ?? []).find((l) => l.productId === productId && l.lot === lot)?.availableBoxes ?? 0;
    const used = lines.filter((l) => l.productId === productId && l.lot === lot && l.key !== excludeKey).reduce((s, l) => s + l.boxes, 0);
    return avail - used;
  };

  function changeSource(id: string) {
    setFromId(id);
    setLines([]);
    setPicker({ productId: "", lot: "", boxes: 1 });
  }

  function addLine() {
    if (!pickerProduct || !pickerLot || picker.boxes <= 0) return;
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === pickerProduct && l.lot === pickerLot);
      if (existing) return ls.map((l) => (l === existing ? { ...l, boxes: l.boxes + picker.boxes } : l));
      return [...ls, { key: Date.now(), productId: pickerProduct, lot: pickerLot, boxes: picker.boxes }];
    });
    setPicker({ ...picker, boxes: 1 });
  }

  const overLines = lines.filter((l) => l.boxes > remaining(l.productId, l.lot, l.key));
  const totalBoxes = lines.reduce((s, l) => s + l.boxes, 0);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const t = await apiPost<TransferDTO>("/api/transfers", {
        fromDepotId: from,
        toDepotId: to,
        driver,
        vehicle,
        note,
        lines: lines.map(({ productId, lot, boxes }) => ({ productId, lot, boxes })),
      });
      // L'état de la page est conservé par Next 16 : on repart d'un formulaire vide.
      setLines([]);
      setDriver("");
      setVehicle("");
      setNote("");
      router.push(`/transferts/${t._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Nouveau transfert" subtitle="Le dépôt expéditeur saisit les articles ; le destinataire validera la réception" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h2 className="section-title">Trajet</h2>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Dépôt expéditeur</span>
              <select value={from} onChange={(e) => changeSource(e.target.value)} className="input">
                {sourceDepots.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Dépôt destinataire</span>
              <select value={to} onChange={(e) => setToId(e.target.value)} className="input">
                {depots
                  .filter((d) => d._id !== from)
                  .map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="label">Chauffeur</span>
              <input value={driver} onChange={(e) => setDriver(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">Véhicule</span>
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="DK-1234-AB" className="input" />
            </label>
            <label className="col-span-2">
              <span className="label">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
            </label>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Ajouter un article</h2>
          {availableProducts.length === 0 ? (
            <Empty>Aucun stock disponible dans ce dépôt.</Empty>
          ) : (
            <>
              <label className="block">
                <span className="label">Article</span>
                <select value={pickerProduct} onChange={(e) => setPicker({ productId: e.target.value, lot: "", boxes: 1 })} className="input">
                  {availableProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} — {p.ref}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Bain (lot)</span>
                  <select value={pickerLot} onChange={(e) => setPicker({ ...picker, lot: e.target.value })} className="input">
                    {pickerLots.map((l) => (
                      <option key={l.lot} value={l.lot}>
                        {l.lot} — {remaining(l.productId, l.lot)} cs
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Caisses</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={picker.boxes}
                    onChange={(e) => setPicker({ ...picker, boxes: Math.max(1, Math.trunc(Number(e.target.value))) })}
                    className="input"
                  />
                </label>
              </div>
              <button type="button" onClick={addLine} className="btn-primary w-full">
                + Ajouter au transfert
              </button>
            </>
          )}
        </section>
      </div>

      <section className="card mt-4 p-4">
        <h2 className="section-title mb-3">Articles à transférer ({totalBoxes} cs)</h2>
        {lines.length === 0 ? (
          <Empty>Aucun article ajouté.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => {
              const p = productMap.get(l.productId);
              const max = remaining(l.productId, l.lot, l.key);
              return (
                <li key={l.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{p?.name}</div>
                    <div className="text-xs text-slate-500">
                      Bain {l.lot} · {p && formatM2(m2ForBoxes(l.boxes, p.m2PerBox))} · max {max} cs
                    </div>
                    {l.boxes > max && <div className="text-xs font-medium text-red-600">Dépasse le disponible ({max} cs)</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={l.boxes}
                      onChange={(e) =>
                        setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, boxes: Math.max(1, Math.trunc(Number(e.target.value))) } : x)))
                      }
                      className="input w-20 text-center"
                      aria-label="Caisses"
                    />
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="btn-danger min-h-10 px-3" aria-label="Retirer">
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && <div className="mt-3"><ErrorBox message={error} /></div>}
        <div className="mt-4 flex gap-2">
          <Link href="/transferts" className="btn-ghost flex-1">
            Annuler
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={saving || lines.length === 0 || overLines.length > 0 || !from || !to}
            className="btn-accent flex-1"
          >
            {saving ? "Envoi…" : "Expédier (en transit)"}
          </button>
        </div>
      </section>
    </>
  );
}
