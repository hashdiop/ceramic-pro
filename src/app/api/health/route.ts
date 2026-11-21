import { route } from "@/server/api";
import { connectDB } from "@/server/db";
import { isCloudinaryEnabled } from "@/server/cloudinary";

/** Vérifie la connexion MongoDB et le support des transactions (replica set). */
export const GET = route(async () => {
  const conn = await connectDB();
  const hello = await conn.connection.db!.admin().command({ hello: 1 });
  return {
    database: conn.connection.name,
    transactions: Boolean(hello.setName || hello.msg === "isdbgrid"),
    cloudinary: isCloudinaryEnabled(),
    realtime: Boolean((globalThis as { __io?: unknown }).__io),
  };
});
