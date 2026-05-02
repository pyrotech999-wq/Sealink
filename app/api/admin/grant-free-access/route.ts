import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { setAdminGrantedFreeAccess } from "@/lib/admin-free-access-store";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const admin = await getAuthUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const uid = typeof o?.uid === "string" ? o.uid.trim() : "";
  const granted = o?.granted === true;
  if (!uid || uid.length < 8) return NextResponse.json({ error: "uid required" }, { status: 400 });
  if (uid === admin.uid) {
    return NextResponse.json({ error: "Use PayPal or another account for your own billing; admin self-grant disabled." }, { status: 400 });
  }

  try {
    await setAdminGrantedFreeAccess(uid, granted);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, uid, granted });
}
