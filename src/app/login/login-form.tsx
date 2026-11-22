"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import type { UserDTO } from "@/lib/types";

/** N'accepte qu'un chemin interne (évite une redirection vers un autre site). */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await apiPost<UserDTO>("/api/auth/login", { email, password });
      // Rechargement complet : toute l'application repart avec la nouvelle session.
      window.location.href = user.mustChangePassword ? "/compte" : safeNext(params.get("next"));
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
