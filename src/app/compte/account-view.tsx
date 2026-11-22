"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { useAuth } from "@/components/auth-context";
import { useDepots } from "@/components/depot-context";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";

export function AccountView() {
  const { user, isAdmin } = useAuth();
  const { depots } = useDepots();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Spinner />;
  const mine = depots.filter((d) => user.depotIds.includes(d._id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("Les deux nouveaux mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      await apiPost("/api/auth/password", { currentPassword: current, newPassword: next });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu : nouvelle session
      window.location.href = "/"; // nouvelle session, application rechargée
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Mon compte" subtitle={user.email} />
      {user.mustChangePassword && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Mot de passe provisoire</strong> : choisissez votre propre mot de passe pour accéder à l&apos;application.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="section-title mb-3">Mes droits</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Nom</dt>
              <dd className="font-semibold">{user.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Rôle</dt>
              <dd className="font-semibold">{isAdmin ? "Administrateur" : "Utilisateur dépôt"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Peut agir sur</dt>
              <dd className="text-right font-semibold">{isAdmin ? "Tous les dépôts" : mine.map((d) => d.name).join(", ") || "Aucun dépôt"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Vous consultez tous les dépôts ; ventes, opérations de stock et transferts ne sont possibles que sur vos dépôts.</p>
        </section>

        <form onSubmit={submit} className="card space-y-3 p-4">
          <h2 className="section-title">Changer de mot de passe</h2>
          <label className="block">
            <span className="label">Mot de passe actuel</span>
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="label">Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className="input" />
            <span className="mt-1 block text-[11px] text-slate-400">8 caractères minimum, avec au moins une lettre et un chiffre.</span>
          </label>
          <label className="block">
            <span className="label">Confirmer</span>
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
          </label>
          {error && <ErrorBox message={error} />}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Enregistrement…" : "Changer le mot de passe"}
          </button>
        </form>
      </div>
    </>
  );
}
