/** Événements temps réel partagés entre le serveur et les clients. */
export const REALTIME_EVENTS = {
  stock: "stock:updated",
  transfers: "transfers:updated",
  invoices: "invoices:updated",
  catalog: "catalog:updated",
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
