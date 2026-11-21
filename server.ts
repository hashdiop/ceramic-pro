/**
 * Serveur Node personnalisé : Next.js + Socket.io sur le même port.
 *
 * Socket.io a besoin d'un serveur HTTP persistant : l'application doit donc
 * être hébergée sur un serveur Node (VPS, Railway, Render, Fly.io…),
 * et non sur un hébergement « serverless » type Vercel.
 */
import { createServer } from "node:http";
import next from "next";
import { Server as IOServer } from "socket.io";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "localhost";
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: dev ? { origin: true } : undefined,
  });

  // Partagé avec les routes API (voir src/server/realtime.ts).
  (globalThis as { __io?: IOServer }).__io = io;

  io.on("connection", (socket) => {
    // Un client peut rejoindre la « salle » de son dépôt (utile quand le RBAC sera en place).
    socket.on("depot:join", (depotId: unknown) => {
      if (typeof depotId === "string" && /^[a-f0-9]{24}$/i.test(depotId)) socket.join(`depot:${depotId}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> CéramiquePro prêt sur http://${hostname}:${port} (${dev ? "développement" : "production"}) — Socket.io actif`);
  });
});
