import { NextResponse } from "next/server";
import { publicRoute } from "@/server/api";
import { loginSchema } from "@/lib/schemas";
import { login } from "@/server/services/users";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/token";

/** Connexion : pose le cookie de session httpOnly. */
export const POST = publicRoute(async (req) => {
  const { email, password } = loginSchema.parse(await req.json());
  const { user, token } = await login(email, password);
  const res = NextResponse.json(user);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
