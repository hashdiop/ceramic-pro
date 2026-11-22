"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { computeInvoice, type CalcProduct } from "@/lib/invoice-calc";
import { CLIENT_TYPES, PAYMENT_METHODS } from "@/lib/schemas";
import { formatCFA, formatM2, m2ForBoxes } from "@/lib/units";
import type { InvoiceDTO, ProductDTO, StockRowDTO } from "@/lib/types";
import { useDepots } from "@/components/depot-context";
import { ReadOnlyNotice, useAuth } from "@/components/auth-context";
import { ProductModal } from "@/components/product-modal";
import {
  Chips,
  Empty,
  ErrorBox,
  PageHeader,
  ProductThumb,
  Spinner,
} from "@/components/ui";

interface CartItem {
  productId: string;
  requestedM2: number;
  lot: string; // "" = choix automatique du meilleur bain
}

const toCalc = (p: ProductDTO): CalcProduct => ({
  id: p._id,
  ref: p.ref,
  name: p.name,
  motif: p.motif,
  format: p.format,
  m2PerBox: p.m2PerBox,
  pricePerM2: p.pricePerM2,
});

export function SaleForm() {
  const router = useRouter();
  const { currentDepot, currentDepotId } = useDepots();
  const { canWrite } = useAuth();
  const writable = canWrite(currentDepotId);
  const products = useApi<ProductDTO[]>("/api/products", [
    REALTIME_EVENTS.catalog,
  ]);
  const stock = useApi<StockRowDTO[]>(
    currentDepotId ? `/api/stock?depotId=${currentDepotId}` : null,
    [REALTIME_EVENTS.stock],
  );

  const [client, setClient] = useState({
    name: "",
    phone: "",
    type: CLIENT_TYPES[0] as string,
  });
  const [payment, setPayment] = useState<string>(PAYMENT_METHODS[0]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [motif, setMotif] = useState("Tous");
  const [search, setSearch] = useState("");
  const [breakage, setBreakage] = useState({
    enabled: false,
    productId: "",
    unit: "caisses" as "caisses" | "m2",
    quantity: 1,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const productList = useMemo(() => products.data ?? [], [products.data]);
  const byId = useMemo(
    () => new Map(productList.map((p) => [p._id, p])),
    [productList],
  );
  const stockById = useMemo(
    () => new Map((stock.data ?? []).map((s) => [s.productId, s])),
    [stock.data],
  );
  const motifs = useMemo(
    () => ["Tous", ...new Set(productList.map((p) => p.motif))],
    [productList],
  );

  const filtered = productList.filter(
    (p) =>
      (motif === "Tous" || p.motif === motif) &&
      (!search ||
        `${p.name} ${p.ref} ${p.format}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );

  const breakageProduct = byId.get(
    breakage.productId || productList[0]?._id || "",
  );
  const calc = useMemo(
    () =>
      computeInvoice(
        cart
          .filter((c) => byId.has(c.productId))
          .map((c) => ({
            product: toCalc(byId.get(c.productId)!),
            requestedM2: c.requestedM2,
            lot: c.lot,
          })),
        breakage.enabled && breakageProduct
          ? {
              product: toCalc(breakageProduct),
              unit: breakage.unit,
              quantity: breakage.quantity,
            }
          : null,
      ),
    [cart, byId, breakage, breakageProduct],
  );

  /** Contrôle du stock disponible pour une ligne (bain choisi ou meilleur bain). */
  function stockCheck(productId: string, lot: string, boxes: number) {
    const row = stockById.get(productId);
    const lots = row?.lots ?? [];
    const available = lot
      ? (lots.find((l) => l.lot === lot)?.availableBoxes ?? 0)
      : Math.max(0, ...lots.map((l) => l.availableBoxes));
    return { ok: boxes <= available, available };
  }
  const stockProblems = calc.lines.filter(
    (l) => !stockCheck(l.product.id, l.lot ?? "", l.boxes).ok,
  ).length;

  function addToCart(productId: string) {
    setCart((c) => {
      const existing = c.find((i) => i.productId === productId);
      if (existing)
        return c.map((i) =>
          i.productId === productId
            ? { ...i, requestedM2: i.requestedM2 + 5 }
            : i,
        );
      return [...c, { productId, requestedM2: 10, lot: "" }];
    });
  }
  const updateItem = (productId: string, patch: Partial<CartItem>) =>
    setCart((c) =>
      c.map((i) => (i.productId === productId ? { ...i, ...patch } : i)),
    );
  const removeItem = (productId: string) =>
    setCart((c) => c.filter((i) => i.productId !== productId));

  async function save() {
    setError(null);
    if (!currentDepotId) return setError("Sélectionnez un dépôt.");
    if (calc.error) return setError(calc.error);
    setSaving(true);
    try {
      const inv = await apiPost<InvoiceDTO>("/api/invoices", {
        depotId: currentDepotId,
        client,
        paymentMethod: payment,
        lines: cart.map((c) => ({
          productId: c.productId,
          requestedM2: c.requestedM2,
          lot: c.lot || undefined,
        })),
        breakage:
          breakage.enabled && breakageProduct
            ? {
                productId: breakageProduct._id,
                unit: breakage.unit,
                quantity: breakage.quantity,
              }
            : null,
      });
      // Next 16 (cacheComponents) conserve l'état de la page quand on la quitte :
      // on remet le formulaire à zéro pour que la vente suivante reparte d'un panier vide.
      setCart([]);
      setClient({ name: "", phone: "", type: CLIENT_TYPES[0] });
      setPayment(PAYMENT_METHODS[0]);
      setBreakage({
        enabled: false,
        productId: "",
        unit: "caisses",
        quantity: 1,
      });
      setSheetOpen(false);
      router.push(`/factures/${inv._id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erreur lors de l'enregistrement",
      );
    } finally {
      setSaving(false);
    }
  }

  if (products.error) return <ErrorBox message={products.error} />;
  if (products.loading && !products.data) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Nouvelle vente"
        subtitle={
          currentDepot ? `Sortie de stock : ${currentDepot.name}` : undefined
        }
      />
      {!writable && currentDepot && (
        <ReadOnlyNotice
          depotName={currentDepot.name}
          action="vendre depuis ce dépôt (changez de dépôt en haut de l'écran)"
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        {/* ------------------------------ Catalogue ------------------------------ */}
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <section className="card p-4">
            <h2 className="section-title mb-3">Catalogue</h2>
            <input
              type="search"
              placeholder="Rechercher un carreau, une référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input mb-3"
            />
            <Chips options={motifs} value={motif} onChange={setMotif} />

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filtered.length === 0 && (
                <Empty>Aucun carreau ne correspond.</Empty>
              )}
              {filtered.map((p) => {
                const inCart = cart.some((c) => c.productId === p._id);
                const s = stockById.get(p._id);
                const avail = s?.availableBoxes ?? 0;
                return (
                  <div
                    key={p._id}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${inCart ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
                  >
                    {/* Photo + nom : ouvre la fiche (grande photo, stock par dépôt) pour éviter les confusions. */}
                    <button
                      type="button"
                      onClick={() => setDetail(p._id)}
                      className="shrink-0"
                      aria-label={`Fiche ${p.name}`}
                    >
                      <ProductThumb src={p.imageUrl} alt={p.name} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetail(p._id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-bold text-slate-900">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.ref} · {p.format} · {p.m2PerBox} m²/cs
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-brand-700">
                          {formatCFA(p.pricePerM2)}/m²
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${avail <= 0 ? "text-red-600" : s?.status === "BAS" ? "text-amber-700" : "text-emerald-700"}`}
                        >
                          {avail} cs dispo
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addToCart(p._id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xl text-white hover:bg-brand-600"
                      aria-label={`Ajouter ${p.name}`}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ------------------------- Panier / Facture -------------------------- */}
        <div
          className={`${sheetOpen ? "fixed inset-0 z-40 flex flex-col bg-slate-50" : "hidden"} lg:static lg:col-span-5 lg:block lg:min-w-0 lg:bg-transparent`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <span className="font-bold text-slate-900">Panier & règlement</span>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="btn-ghost min-h-9 px-3"
            >
              Fermer
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32 lg:sticky lg:top-24 lg:overflow-visible lg:p-0">
            <section className="card p-4">
              <h2 className="section-title mb-3">Articles</h2>
              {calc.lines.length === 0 ? (
                <Empty>Ajoutez un carreau depuis le catalogue.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {calc.lines.map((l) => {
                    const item = cart.find(
                      (c) => c.productId === l.product.id,
                    )!;
                    const lots =
                      stockById
                        .get(l.product.id)
                        ?.lots.filter((x) => x.availableBoxes > 0) ?? [];
                    const check = stockCheck(l.product.id, item.lot, l.boxes);
                    return (
                      <li key={l.product.id} className="space-y-2 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-800">
                              {l.product.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {l.boxes} cs · {formatM2(l.billedM2)} ·{" "}
                              {formatCFA(l.product.pricePerM2)}/m²
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900">
                              {formatCFA(l.lineTotal)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(l.product.id)}
                              className="text-xs text-red-600"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label>
                            <span className="label">Besoin client (m²)</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0.01}
                              step={0.5}
                              value={item.requestedM2}
                              onChange={(e) =>
                                updateItem(l.product.id, {
                                  requestedM2: Math.max(
                                    0,
                                    Number(e.target.value),
                                  ),
                                })
                              }
                              className="input"
                            />
                          </label>
                          <label>
                            <span className="label">Bain (lot)</span>
                            <select
                              value={item.lot}
                              onChange={(e) =>
                                updateItem(l.product.id, {
                                  lot: e.target.value,
                                })
                              }
                              className="input"
                            >
                              <option value="">Auto (meilleur bain)</option>
                              {lots.map((x) => (
                                <option key={x.lot} value={x.lot}>
                                  {x.lot} — {x.availableBoxes} cs
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {!check.ok && (
                          <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                            Stock insuffisant : {check.available} caisse(s)
                            disponible(s){" "}
                            {item.lot
                              ? `dans le bain ${item.lot}`
                              : "dans un même bain"}
                            .
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card p-4">
              <h2 className="section-title mb-3">Client & règlement</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Nom du client / entreprise</span>
                  <input
                    value={client.name}
                    onChange={(e) =>
                      setClient({ ...client, name: e.target.value })
                    }
                    placeholder="Client Comptoir"
                    className="input"
                  />
                </label>
                <label>
                  <span className="label">Téléphone</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={client.phone}
                    onChange={(e) =>
                      setClient({ ...client, phone: e.target.value })
                    }
                    className="input"
                  />
                </label>
                <label>
                  <span className="label">Profil</span>
                  <select
                    value={client.type}
                    onChange={(e) =>
                      setClient({ ...client, type: e.target.value })
                    }
                    className="input"
                  >
                    {CLIENT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2">
                  <span className="label">Mode de paiement</span>
                  <select
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                    className="input"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="card border-amber-200 bg-amber-50/60 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                    Report carreaux cassés
                  </span>
                  <span className="text-xs text-amber-700">
                    Déduire une casse constatée sur cette facture
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={breakage.enabled}
                  onChange={(e) =>
                    setBreakage({ ...breakage, enabled: e.target.checked })
                  }
                  className="h-6 w-6 accent-amber-600"
                />
              </label>
              {breakage.enabled && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-amber-200 pt-3">
                  <label className="col-span-2">
                    <span className="label">Article concerné</span>
                    <select
                      value={breakageProduct?._id ?? ""}
                      onChange={(e) =>
                        setBreakage({ ...breakage, productId: e.target.value })
                      }
                      className="input"
                    >
                      {productList.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} ({p.motif})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">Unité</span>
                    <select
                      value={breakage.unit}
                      onChange={(e) =>
                        setBreakage({
                          ...breakage,
                          unit: e.target.value as "caisses" | "m2",
                        })
                      }
                      className="input"
                    >
                      <option value="caisses">Caisses</option>
                      <option value="m2">m²</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">Quantité</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={breakage.unit === "caisses" ? 1 : 0.01}
                      value={breakage.quantity}
                      onChange={(e) =>
                        setBreakage({
                          ...breakage,
                          quantity: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="input"
                    />
                  </label>
                </div>
              )}
            </section>

            <section className="card space-y-1.5 p-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Surface facturée</span>
                <span className="font-semibold">{formatM2(calc.totalM2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Sous-total marchandise</span>
                <span className="font-semibold">
                  {formatCFA(calc.subtotal)}
                </span>
              </div>
              {calc.breakage && (
                <div className="flex justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                  <span>
                    Casse (
                    {calc.breakage.unit === "caisses"
                      ? `${calc.breakage.quantity} cs = ${formatM2(m2ForBoxes(calc.breakage.quantity, calc.breakage.product.m2PerBox))}`
                      : formatM2(calc.breakage.m2)}
                    )
                  </span>
                  <span className="font-semibold">
                    - {formatCFA(calc.breakageAmount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                <span>NET À PAYER</span>
                <span>{formatCFA(calc.netTotal)}</span>
              </div>
              {calc.error && calc.lines.length > 0 && (
                <p className="text-xs font-medium text-red-600">{calc.error}</p>
              )}
              {error && <ErrorBox message={error} />}
              <button
                type="button"
                onClick={save}
                disabled={
                  !writable ||
                  saving ||
                  calc.lines.length === 0 ||
                  Boolean(calc.error) ||
                  stockProblems > 0
                }
                className="btn-success mt-2 w-full"
              >
                {saving ? "Enregistrement…" : "✓ Enregistrer la vente"}
              </button>
              {stockProblems > 0 && (
                <p className="text-center text-xs text-red-600">
                  Corrigez les lignes en stock insuffisant.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Barre récapitulative mobile (au-dessus de la navigation) */}
      {!sheetOpen && (
        <div className="no-print fixed inset-x-0 bottom-[4.25rem] z-30 px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg"
          >
            <span className="text-sm">
              Panier{" "}
              <span className="ml-1 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-slate-900">
                {cart.length}
              </span>
            </span>
            <span className="text-sm font-bold">
              {formatCFA(calc.netTotal)} →
            </span>
          </button>
        </div>
      )}
      <ProductModal
        productId={detail}
        onClose={() => setDetail(null)}
        actions={(p) =>
          writable && (
            <button
              type="button"
              onClick={() => {
                addToCart(p.productId);
                setDetail(null);
              }}
              className="btn-primary w-full"
            >
              + Ajouter au panier ({currentDepot?.name})
            </button>
          )
        }
      />
    </>
  );
}
