"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPatch, apiPost, useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import { formatCFA, formatDateTime } from "@/lib/units";
import type { DepotDTO, InvoiceDTO, MovementDTO, Role, StockRowDTO, TransferDTO, UserDTO } from "@/lib/types";
import { useAuth } from "@/components/auth-context";
import { useDepots } from "@/components/depot-context";
import { Sheet } from "@/components/sheet";
import { Empty, ErrorBox, Kpi, PageHeader, Spinner } from "@/components/ui";
import { TYPE_LABEL } from "../stock/mouvements/movements-view";

const TABS = [
  { key: "comptes", label: "Comptes" },
  { key: "supervision", label: "Supervision" },
] as const;

export function AdminView() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("onglet") === "supervision" ? "supervision" : "comptes";
  return (
    <>
      <PageHeader title="Espace admin" subtitle="Comptes utilisateurs et supervision des dépôts" />
      <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/70 p-1 sm:inline-grid sm:w-80">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.replace(`/admin?onglet=${t.key}`, { scroll: false })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "comptes" ? <Accounts /> : <Supervision />}
    </>
  );
}

/* ---------------------------------- Comptes ---------------------------------- */

function Accounts() {
  const { data, error, loading, reload } = useApi<UserDTO[]>("/api/users");
  const { depots } = useDepots();
  const [editing, setEditing] = useState<UserDTO | "new" | null>(null);
  const depotName = (id: string) => depots.find((d) => d._id === id)?.name ?? "Dépôt archivé";

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setEditing("new")} className="btn-accent">
          + Nouveau compte
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <Empty>Aucun compte.</Empty>}
      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {(data ?? []).map((u) => (
          <li key={u._id}>
            <button
              type="button"
              onClick={() => setEditing(u)}
              className={`card w-full p-3.5 text-left transition hover:border-brand-500 ${u.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-slate-900">{u.email}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    u.role === "ADMIN" ? "bg-slate-900 text-white" : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {u.role === "ADMIN" ? "Admin" : "Dépôt"}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-slate-700">{u.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {u.role === "ADMIN" ? "Tous les dépôts" : u.depotIds.map(depotName).join(", ") || "Aucun dépôt attribué"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                {!u.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">Désactivé</span>}
                {u.mustChangePassword && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Mot de passe provisoire</span>}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                  {u.lastLoginAt ? `Dernière connexion ${formatDateTime(u.lastLoginAt)}` : "Jamais connecté"}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={editing !== null} title={editing === "new" ? "Nouveau compte" : "Modifier le compte"} onClose={() => setEditing(null)}>
        {editing !== null && (
          <UserForm
            key={editing === "new" ? "new" : editing._id}
            user={editing === "new" ? null : editing}
            depots={depots}
            onDone={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function UserForm({ user, depots, onDone }: { user: UserDTO | null; depots: DepotDTO[]; onDone: () => void }) {
  const { user: me } = useAuth();
  const self = user?._id === me?.id;
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "USER");
  const [depotIds, setDepotIds] = useState<string[]>(user?.depotIds ?? []);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "save" | "toggle">(null);
  const [error, setError] = useState<string | null>(null);

  const toggleDepot = (id: string) => setDepotIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

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
    if (role === "USER" && depotIds.length === 0) return setError("Attribuez au moins un dépôt à ce compte.");
    run("save", () =>
      user
        ? apiPatch(`/api/users/${user._id}`, { name, role, depotIds, ...(password ? { resetPassword: password } : {}) })
        : apiPost("/api/users", { email, name, role, depotIds, password }),
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="label">E-mail *</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={Boolean(user)} className="input disabled:bg-slate-100" placeholder="depot3@cpro.com" />
      </label>
      <label className="block">
        <span className="label">Nom *</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="input" placeholder="Responsable Dépôt Pikine" />
      </label>

      <div>
        <span className="label">Rôle</span>
        <div className="grid grid-cols-2 gap-2">
          {(["USER", "ADMIN"] as const).map((r) => (
            <button
              key={r}
              type="button"
              disabled={self}
              onClick={() => setRole(r)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${role === r ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 bg-white"}`}
            >
              <div className="font-semibold">{r === "ADMIN" ? "Administrateur" : "Utilisateur dépôt"}</div>
              <div className="text-[11px] text-slate-500">{r === "ADMIN" ? "Agit partout, gère comptes et catalogue" : "Agit sur ses dépôts, consulte les autres"}</div>
            </button>
          ))}
        </div>
        {self && <p className="mt-1 text-[11px] text-slate-400">Vous ne pouvez pas modifier votre propre rôle.</p>}
      </div>

      {role === "USER" && (
        <div>
          <span className="label">Dépôts attribués *</span>
          <div className="space-y-1.5">
            {depots.map((d) => (
              <label key={d._id} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                <input type="checkbox" checked={depotIds.includes(d._id)} onChange={() => toggleDepot(d._id)} className="h-5 w-5 accent-slate-900" />
                <span className="font-medium">
                  {d.code} — {d.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="label">{user ? "Réinitialiser le mot de passe" : "Mot de passe provisoire *"}</span>
        <input
          type="text"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!user}
          minLength={8}
          className="input"
          placeholder={user ? "Laisser vide pour ne pas changer" : "8 caractères, lettres et chiffres"}
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          Communiquez-le à l&apos;utilisateur : il devra le remplacer à sa prochaine connexion.
        </span>
      </label>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="submit" disabled={busy !== null} className="btn-primary sm:flex-1">
          {busy === "save" ? "Enregistrement…" : user ? "Enregistrer" : "Créer le compte"}
        </button>
        {user && !self && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("toggle", () => apiPatch(`/api/users/${user._id}`, { active: !user.active }))}
            className={user.active ? "btn-danger sm:flex-1" : "btn-ghost sm:flex-1"}
          >
            {busy === "toggle" ? "Traitement…" : user.active ? "Désactiver le compte" : "Réactiver le compte"}
          </button>
        )}
      </div>
    </form>
  );
}

/* -------------------------------- Supervision -------------------------------- */

function Supervision() {
  const { depots } = useDepots();
  const [depotId, setDepotId] = useState("");
  const stock = useApi<StockRowDTO[]>("/api/stock", [REALTIME_EVENTS.stock]);
  const transit = useApi<TransferDTO[]>("/api/transfers?status=EN_TRANSIT", [REALTIME_EVENTS.transfers]);
  const invoices = useApi<InvoiceDTO[]>("/api/invoices", [REALTIME_EVENTS.invoices]);
  const moves = useApi<MovementDTO[]>(`/api/stock/movements?limit=60${depotId ? `&depotId=${depotId}` : ""}`, [REALTIME_EVENTS.stock]);

  const summary = useMemo(() => {
    const today = new Date().toDateString();
    return depots.map((d) => {
      const rows = (stock.data ?? []).filter((r) => r.depotId === d._id);
      const sales = (invoices.data ?? []).filter((i) => i.depot?._id === d._id && new Date(i.createdAt).toDateString() === today);
      return {
        depot: d,
        boxes: rows.reduce((s, r) => s + r.onHandBoxes, 0),
        alerts: rows.filter((r) => r.status !== "OK").length,
        outgoing: (transit.data ?? []).filter((t) => t.fromDepot?._id === d._id).length,
        incoming: (transit.data ?? []).filter((t) => t.toDepot?._id === d._id).length,
        salesCount: sales.length,
        salesAmount: sales.reduce((s, i) => s + i.netTotal, 0),
      };
    });
  }, [depots, stock.data, invoices.data, transit.data]);

  return (
    <>
      <section className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {summary.map((s) => (
          <div key={s.depot._id} className="card p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="truncate font-bold text-slate-900">{s.depot.name}</h2>
              <span className="text-xs text-slate-400">{s.depot.code}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Ventes du jour" value={formatCFA(s.salesAmount)} hint={`${s.salesCount} facture(s)`} />
              <Kpi label="Stock" value={`${s.boxes} cs`} hint={`${s.alerts} alerte(s)`} />
              <Kpi label="Transferts sortants" value={String(s.outgoing)} hint="en transit" />
              <Kpi label="Transferts entrants" value={String(s.incoming)} hint="à réceptionner" />
            </div>
          </div>
        ))}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Activité récente</h2>
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className="input w-auto min-w-0 py-1.5 text-sm">
            <option value="">Tous les dépôts</option>
            {depots.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {moves.error && <ErrorBox message={moves.error} />}
        {moves.loading && !moves.data && <Spinner />}
        {moves.data && moves.data.length === 0 && <Empty>Aucune activité.</Empty>}
        <ul className="divide-y divide-slate-100">
          {(moves.data ?? []).map((m) => {
            const [label, cls] = TYPE_LABEL[m.type] ?? [m.type, "bg-slate-100 text-slate-700"];
            return (
              <li key={m._id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
                    {m.refNumber && <span className="text-[11px] text-slate-400">{m.refNumber}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{m.product?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {m.depot?.name} · {formatDateTime(m.createdAt)} · <strong className="font-semibold text-slate-700">{m.createdByName || "—"}</strong>
                  </div>
                </div>
                <div className={`shrink-0 text-sm font-bold ${m.deltaBoxes < 0 ? "text-red-600" : m.deltaBoxes > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                  {m.deltaBoxes > 0 ? "+" : ""}
                  {m.deltaBoxes} cs
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
