"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Connexion Socket.io unique pour toute l'application (même origine que Next). */
export function getSocket(): Socket {
  if (!socket) {
    // Sur un hébergement sans serveur Socket.io (Vercel), on abandonne après quelques essais :
    // les pages se rechargent alors après chaque écriture et au retour sur l'onglet (voir useApi).
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"], reconnectionAttempts: 5 });
    // Nouvelle tentative au retour sur l'onglet (serveur redémarré, mise en veille…).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && socket && !socket.connected && !socket.active) socket.connect();
    });
  }
  return socket;
}
