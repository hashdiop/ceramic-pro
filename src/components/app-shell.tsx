"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/client/socket";
import { useAuth } from "./auth-context";
import { useDepots } from "./depot-context";

const NAV = [
  { href: "/", label: "Accueil", icon: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" },
  { href: "/vente", label: "Vente", icon: "M4 5h16v14H4zM8 9h8M8 13h5" },
  { href: "/stock", label: "Stock", icon: "M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4" },
  { href: "/transferts", label: "Transferts", icon: "M4 8h13l-3-3M20 16H7l3 3" },
  { href: "/factures", label: "Factures", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
];

const SETTINGS_ICON =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

function useRealtimeStatus() {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    s.on("connect", on);
    s.on("disconnect", off);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- état initial de la connexion
    setOnline(s.connected);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return online;
}

function DepotSwitcher() {
  const { depots, currentDepotId, setCurrentDepotId } = useDepots();
  const { canWrite } = useAuth();
  if (!depots.length) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <span className="hidden sm:inline">Dépôt</span>
      <select
        value={currentDepotId}
        onChange={(e) => setCurrentDepotId(e.target.value)}
        className="max-w-[10.5rem] rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-brand-500 sm:max-w-none"
        aria-label="Dépôt de travail"
      >
        {depots.map((d) => (
          <option key={d._id} value={d._id}>
            {d.code} — {d.name}
              {canWrite(d._id) ? "" : " (consultation)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserMenu({ active }: { active: boolean }) {
  const { user, isAdmin, logout } = useAuth();
  const { depots } = useDepots();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- referme le menu après navigation
  useEffect(() => setOpen(false), [pathname]);
  if (!user) return null;

  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const scope = isAdmin
    ? "Administrateur · tous les dépôts"
    : depots
        .filter((d) => user.depotIds.includes(d._id))
        .map((d) => d.name)
        .join(", ") || "Aucun dépôt attribué";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu utilisateur"
        aria-expanded={open}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
          active || open ? "bg-brand-500 text-slate-900" : "bg-slate-700 text-white hover:bg-slate-600"
        }`}
      >
        {initials || "?"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="truncate text-sm font-bold">{user.name}</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
              <div className="mt-1 text-[11px] font-medium text-brand-700">{scope}</div>
            </div>
            <nav className="py-1 text-sm">
              {isAdmin && (
                <Link href="/admin" className="block px-4 py-2.5 hover:bg-slate-50">
                  Espace admin
                </Link>
              )}
              <Link href="/parametres" className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
                <Icon d={SETTINGS_ICON} className="h-4 w-4" /> Paramètres {isAdmin ? "" : "(consultation)"}
              </Link>
              <Link href="/compte" className="block px-4 py-2.5 hover:bg-slate-50">
                Mon compte · mot de passe
              </Link>
              <button type="button" onClick={logout} className="block w-full px-4 py-2.5 text-left font-medium text-red-600 hover:bg-red-50">
                Se déconnecter
              </button>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const online = useRealtimeStatus();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 lg:h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold text-slate-900">C</span>
            <span className="hidden text-base font-bold leading-tight min-[400px]:inline">
              Céramique<span className="text-brand-400">Pro</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive(n.href) ? "bg-brand-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon d={n.icon} className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <DepotSwitcher />
            <UserMenu active={isActive("/parametres") || isActive("/admin") || isActive("/compte")} />
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? "bg-emerald-400" : "bg-slate-500"}`}
              title={online ? "Temps réel connecté" : "Temps réel déconnecté"}
              aria-label={online ? "Temps réel connecté" : "Temps réel déconnecté"}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-4 lg:pb-10 lg:pt-6">{children}</main>

      {/* Navigation mobile en bas d'écran (zone du pouce) */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                    active ? "text-brand-700" : "text-slate-500"
                  }`}
                >
                  <span className={`rounded-full px-3 py-1 ${active ? "bg-brand-100" : ""}`}>
                    <Icon d={n.icon} />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
