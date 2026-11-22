import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Jeton de session signé (HMAC-SHA256), stocké dans un cookie httpOnly.
 * Volontairement sans dépendance à la base : le proxy peut le vérifier rapidement.
 * Le serveur recharge ensuite l'utilisateur à chaque requête (compte actif, version du jeton),
 * ce qui rend immédiats la désactivation d'un compte et la réinitialisation d'un mot de passe.
 */
export const SESSION_COOKIE = "cpro_session";
export const SESSION_MAX_AGE = 7 * 24 * 3600; // 7 jours

export interface SessionPayload {
  uid: string;
  /** Version du jeton : incrémentée à chaque changement de mot de passe ou désactivation. */
  v: number;
  role: "ADMIN" | "USER";
  mcp: boolean; // changement de mot de passe obligatoire
  exp: number; // secondes epoch
}

const sign = (data: string) => createHmac("sha256", env.authSecret).update(data).digest("base64url");

export function createToken(p: Omit<SessionPayload, "exp">): string {
  const payload: SessionPayload = { ...p, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    return p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
