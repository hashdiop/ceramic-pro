"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPost, useApi } from "@/lib/client/api";
import type { UserDTO } from "@/lib/types";

/** N'accepte qu'un chemin interne (évite une redirection vers un autre site). */
interface DemoAccount {
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  depots: string[];
}

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = useApi<{ enabled: boolean; accounts: DemoAccount[] }>("/api/auth/demo");

  const go = (user: UserDTO) => {
    // Rechargement complet : toute l'application repart avec la nouvelle session.
    window.location.assign(user.mustChangePassword ? "/compte" : safeNext(params.get("next")));
  };

  async function quickLogin(account: string) {
    setError(null);
    setBusy(true);
    try {
      go(await apiPost<UserDTO>("/api/auth/demo", { email: account }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      go(await apiPost<UserDTO>("/api/auth/login", { email, password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-slate-900">C</span>
          <div>
            <div className="text-lg font-bold leading-tight text-slate-900">
              Céramique<span className="text-brand-600">Pro</span>
            </div>
            <div className="text-xs text-slate-500">Connexion à votre espace</div>
          </div>
        </div>
        {demo.data?.enabled && demo.data.accounts.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <strong>Mode démo</strong> : connexion rapide, sans mot de passe, pour tester chaque rôle.
            </div>
            <div className="grid grid-cols-1 gap-2">
              {demo.data.accounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  disabled={busy}
                  onClick={() => quickLogin(a.email)}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-400 disabled:opacity-60"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      a.role === "ADMIN" ? "bg-slate-900 text-white" : "bg-brand-500 text-slate-900"
                    }`}
                  >
                    {a.role === "ADMIN" ? "A" : "D"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{a.role === "ADMIN" ? "Administrateur" : a.depots.join(", ") || a.name}</span>
                    <span className="block truncate text-xs text-slate-500">{a.email}</span>
                  </span>
                  <span className="text-slate-400">→</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[11px] uppercase text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> ou avec un mot de passe <span className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        )}
        <label className="mb-3 block">
          <span className="label">E-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="depot1@cpro.com"
          />
        </label>
        <label className="mb-4 block">
          <span className="label">Mot de passe</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </label>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
