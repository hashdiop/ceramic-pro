"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeEvent } from "@/lib/realtime-events";
import { getSocket } from "./socket";

export class ApiError extends Error {}

/** Au-delà, la requête est abandonnée : un bouton ne doit jamais rester figé. */
const TIMEOUT_MS = 30_000;

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const write = init?.method && init.method !== "GET";
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ApiError(
        write
          ? "Le serveur ne répond pas. Vérifiez dans la liste si l'opération a été enregistrée avant de réessayer."
          : "Le serveur ne répond pas. Réessayez dans un instant.",
      );
    }
    throw new ApiError("Connexion au serveur impossible. Vérifiez votre réseau.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error || `Erreur ${res.status}`);
  return body as T;
}

export const apiPost = <T>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: "POST", body: JSON.stringify(data ?? {}) });

/**
 * Charge une ressource API et la recharge automatiquement
 * à la réception des événements temps réel indiqués.
 */
export function useApi<T>(url: string | null, events: RealtimeEvent[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const reqId = useRef(0);
  const eventsKey = events.join("|");

  const reload = useCallback(async () => {
    if (!url) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await apiFetch<T>(url);
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial des données
    reload();
  }, [reload]);

  useEffect(() => {
    if (!eventsKey) return;
    const socket = getSocket();
    const list = eventsKey.split("|");
    const onEvent = () => reload();
    list.forEach((e) => socket.on(e, onEvent));
    return () => list.forEach((e) => socket.off(e, onEvent));
  }, [eventsKey, reload]);

  return { data, error, loading, reload };
}

export const apiPatch = <T>(url: string, data: unknown) =>
  apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(data) });
