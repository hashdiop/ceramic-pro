import type { Server as IOServer } from "socket.io";
import type { RealtimeEvent } from "@/lib/realtime-events";

/**
 * Le serveur Socket.io est créé dans server.ts (serveur Node personnalisé)
 * et partagé via globalThis, ce qui permet aux routes API de diffuser des événements.
 */
const g = globalThis as unknown as { __io?: IOServer };

export function setIO(io: IOServer) {
  g.__io = io;
}

/** Diffuse un événement à tous les clients connectés (sans effet si Socket.io est absent). */
export function broadcast(event: RealtimeEvent, payload: Record<string, unknown> = {}) {
  g.__io?.emit(event, { ...payload, at: new Date().toISOString() });
}
