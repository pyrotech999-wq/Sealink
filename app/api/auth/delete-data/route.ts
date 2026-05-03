import { NextResponse } from "next/server";
import { AUTH_EMAIL_COOKIE, getAuthUser } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/delete-user-account";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-session";
import { sessionCookieBase } from "@/lib/session-cookies";

export const runtime = "nodejs";

/**
 * POST JSON body: `{ "confirm": "DELETE_MY_ACCOUNT" }` — must match exactly.
 * Clears session cookies on success.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in first, then try again from the Delete your data page." }, { status: 401 });
  }

  let confirm = "";
  try {
    const body = (await req.json()) as { confirm?: unknown };
    confirm = typeof body.confirm === "string" ? body.confirm : "";
  } catch {
    /* */
  }
  if (confirm !== "DELETE_MY_ACCOUNT") {
    return NextResponse.json(
      { ok: false, error: "Confirmation text did not match. Use the button on the Delete your data page." },
      { status: 400 },
    );
  }

  const result = await deleteUserAccount(user.uid, user.email);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true as const });
  const base = sessionCookieBase();
  res.cookies.set(DEMO_SESSION_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(AUTH_EMAIL_COOKIE, "", { ...base, maxAge: 0 });
  return res;
}
