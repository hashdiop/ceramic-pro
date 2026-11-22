"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { DepotDTO } from "@/lib/types";
import { useAuth } from "./auth-context";

interface DepotCtx {
  depots: DepotDTO[];
  /** Dépôt de travail de l'utilisateur (mémorisé sur l'appareil). */
  currentDepotId: string;
  setCurrentDepotId: (id: string) => void;
  currentDepot: DepotDTO | undefined;
  loading: boolean;
  error: string | null;
}

const Ctx = createContext<DepotCtx | null>(null);
const STORAGE_KEY = "cp.currentDepot";

export function DepotProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = useApi<DepotDTO[]>("/api/depots", [REALTIME_EVENTS.catalog]);
  const { user } = useAuth();
  const [stored, setStored] = useState("");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage local après hydratation
      setStored(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const value = useMemo<DepotCtx>(() => {
    const depots = data ?? [];
    // Par défaut : le premier dépôt attribué à l'utilisateur (sinon le premier dépôt).
    const own = depots.find((d) => user?.depotIds.includes(d._id));
    const currentDepotId = depots.some((d) => d._id === stored) ? stored : (own?._id ?? depots[0]?._id ?? "");
    return {
      depots,
      currentDepotId,
      currentDepot: depots.find((d) => d._id === currentDepotId),
      setCurrentDepotId: (id: string) => {
        setStored(id);
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* stockage indisponible */
        }
      },
      loading,
      error,
    };
  }, [data, stored, loading, error, user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDepots() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDepots doit être utilisé dans <DepotProvider>");
  return ctx;
}
