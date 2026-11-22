"use client";

import { createContext, useContext, useMemo } from "react";
import { apiPost, useApi } from "@/lib/client/api";
import type { SessionUserDTO } from "@/lib/types";

interface AuthCtx {
  user: SessionUserDTO | null;
  loading: boolean;
  isAdmin: boolean;
  /** Reflet des règles serveur : l'interface masque ou désactive, le serveur décide. */
  canWrite: (depotId: string | undefined | null) => boolean;
  logout: () => Promise<void>;
  reload: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, reload } = useApi<SessionUserDTO>("/api/auth/me");
  const value = useMemo<AuthCtx>(() => {
    const isAdmin = data?.role === "ADMIN";
    return {
      user: data,
      loading,
      isAdmin,
      canWrite: (depotId) => Boolean(data && depotId && (isAdmin || data.depotIds.includes(depotId))),
      logout: async () => {
        await apiPost("/api/auth/logout").catch(() => {});
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu : aucun état de la session précédente ne doit subsister
        window.location.href = "/login";
      },
      reload,
    };
  }, [data, loading, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

/** Bandeau « consultation seule » pour un dépôt non attribué. */
export function ReadOnlyNotice({ depotName, action }: { depotName?: string; action: string }) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong>Consultation seule</strong> : {depotName ?? "ce dépôt"} ne vous est pas attribué, vous ne pouvez pas {action}.
    </div>
  );
}
