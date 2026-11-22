import { NextResponse } from "next/server";
import { publicRoute } from "@/server/api";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/token";

export const POST = publicRoute(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
});
