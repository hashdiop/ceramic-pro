"use client"; // Les error boundaries sont des composants client

import Link from "next/link";
import { useEffect } from "react";

/**
 * Erreur inattendue dans une page : on garde l'en-tête et la navigation (layout)
 * et on propose de réessayer, au lieu de l'écran noir par défaut.
 */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto mt-6 max-w-md p-6 text-center">
      <div className="text-3xl">⚠️</div>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Cette page a rencontré un problème</h1>
      <p className="mt-1 text-sm text-slate-600">
        Souvent une connexion coupée pendant le chargement. Vos données enregistrées ne sont pas perdues.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => retry()} className="btn-primary flex-1">
          Réessayer
        </button>
        <Link href="/" className="btn-ghost flex-1">
          Accueil
        </Link>
      </div>
    </div>
  );
}
