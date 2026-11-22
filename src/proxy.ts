import { NextResponse, type NextRequest } from "next/server";
import { readToken, SESSION_COOKIE } from "@/server/auth/token";

/**
 * Garde des pages (Next 16 : « proxy » remplace « middleware »).
 * Ce n'est qu'un aiguillage rapide : la vraie vérification (compte actif, rôle, dépôts)
 * est refaite côté serveur à chaque appel d'API.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = readToken(req.cookies.get(SESSION_COOKIE)?.value);
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (pathname === "/login") return session ? to(session.mcp ? "/compte" : "/") : NextResponse.next();
  if (!session) return to(`/login?next=${encodeURIComponent(pathname + search)}`);
  if (session.mcp && pathname !== "/compte") return to("/compte");
  if (pathname.startsWith("/admin") && session.role !== "ADMIN") return to("/");
  return NextResponse.next();
}

export const config = {
  // Pages uniquement : les API vérifient elles-mêmes la session (réponse 401 en JSON).
  matcher: ["/((?!api|_next|socket\\.io|tiles|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)"],
};
