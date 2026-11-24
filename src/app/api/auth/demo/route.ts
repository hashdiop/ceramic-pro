import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/server/api";
import { env } from "@/lib/env";
import { AppError } from "@/server/errors";
import { demoLogin, listDemoAccounts } from "@/server/services/users";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/token";

/**
 * Connexion rapide du mode démo (DEMO_LOGIN=true). Aucun mot de passe n'est transmis ni affiché :
 * le serveur ouvre directement la session d'un des comptes de démonstration.
 * Variable absente : la route répond « désactivé » et refuse toute connexion.
 */
export const GET = publicRoute(async () => (env.demoLogin ? { enabled: true, accounts: await listDemoAccounts() } : { enabled: false, accounts: [] }));

const body = z.object({ email: z.string().trim().toLowerCase() });

export const POST = publicRoute(async (req) => {
  if (!env.demoLogin) throw new AppError("Mode démo désactivé.", 403);
  const { user, token } = await demoLogin(body.parse(await req.json()).email);
  const res = NextResponse.json(user);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
