import { NextResponse } from "next/server";
import { route } from "@/server/api";
import { passwordChangeSchema } from "@/lib/schemas";
import { changeOwnPassword } from "@/server/services/users";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/token";

/** Changement de son mot de passe : renouvelle la session (les autres appareils sont déconnectés). */
export const POST = route(
  async (req, _ctx, actor) => {
    const { currentPassword, newPassword } = passwordChangeSchema.parse(await req.json());
    const { user, token } = await changeOwnPassword(actor, currentPassword, newPassword);
    const res = NextResponse.json(user);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  },
  { allowPendingPassword: true },
);
