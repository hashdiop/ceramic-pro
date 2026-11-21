"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Connexion Socket.io unique pour toute l'application (même origine que Next). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return socket;
}
