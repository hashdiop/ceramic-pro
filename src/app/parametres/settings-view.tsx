"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProductsAdmin } from "./products-admin";
import { DepotsAdmin } from "./depots-admin";

const TABS = [
  { key: "produits", label: "Produits" },
  { key: "depots", label: "Dépôts" },
] as const;

export function SettingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("onglet") === "depots" ? "depots" : "produits";

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Catalogue produits et dépôts" />
      <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/70 p-1 sm:inline-grid sm:w-80">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.replace(`/parametres?onglet=${t.key}`, { scroll: false })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "produits" ? <ProductsAdmin /> : <DepotsAdmin />}
    </>
  );
}
