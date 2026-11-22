"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/client/api";
import { REALTIME_EVENTS } from "@/lib/realtime-events";
import type { DepotDTO } from "@/lib/types";
import { useAuth } from "./auth-context";

interface DepotCtx {
  depots: DepotDTO[];
  /** Dépôts où l'utilisateur peut agir (tous pour l'admin) : seuls choix possibles comme dépôt de travail. */
  workDepots: DepotDTO[];
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
    // Le dépôt de travail est toujours un dépôt attribué (les autres se consultent via la page Réseau).
    const own = user?.role === "ADMIN" ? depots : depots.filter((d) => user?.depotIds.includes(d._id));
    const workDepots = own.length ? own : depots; // aucun dépôt attribué : consultation seule
    const currentDepotId = workDepots.some((d) => d._id === stored) ? stored : (workDepots[0]?._id ?? "");
    return {
      depots,
      workDepots,
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
