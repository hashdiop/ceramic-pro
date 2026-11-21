"use client";

import type { StockStatus, TransferStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Kpi({ label, value, tone = "slate", hint }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" | "red" | "sky"; hint?: string }) {
  const colors = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    sky: "text-sky-600",
  };
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-bold sm:text-2xl ${colors[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const STOCK_BADGE: Record<StockStatus, [string, string]> = {
  RUPTURE: ["Rupture", "bg-red-100 text-red-700"],
  BAS: ["Stock bas", "bg-amber-100 text-amber-800"],
  OK: ["OK", "bg-emerald-100 text-emerald-700"],
};
export function StockBadge({ status }: { status: StockStatus }) {
  const [label, cls] = STOCK_BADGE[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

const TRANSFER_BADGE: Record<TransferStatus, [string, string]> = {
  EN_TRANSIT: ["En transit", "bg-sky-100 text-sky-700"],
  RECU: ["Reçu", "bg-emerald-100 text-emerald-700"],
  ANNULE: ["Annulé", "bg-slate-200 text-slate-600"],
};
export function TransferBadge({ status }: { status: TransferStatus }) {
  const [label, cls] = TRANSFER_BADGE[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export function ProductThumb({ src, alt, size = "h-14 w-14" }: { src?: string; alt: string; size?: string }) {
  if (!src) return <div className={`${size} shrink-0 rounded-lg bg-slate-200`} aria-hidden />;
  // Les textures d'exemple sont des SVG locaux ; Cloudinary servira les vraies photos.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${size} shrink-0 rounded-lg border border-slate-200 object-cover`} loading="lazy" />;
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`chip ${value === o ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
