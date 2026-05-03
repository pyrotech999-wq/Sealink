import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { validateProfileDisplayName } from "@/lib/profile-display-name";
import {
  getProfileMeRow,
  readProfilePayloadForMerge,
  upsertProfileAfterSignUp,
  type SignUpProfilePayload,
} from "@/lib/profiles-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { normalisePhone } from "@/lib/phone-normalise";

export const runtime = "nodejs";

type PatchBody = {
  fullName?: unknown;
  boatName?: unknown;
  phone?: unknown;
  avatarDataUrl?: unknown;
};

/** Signed-in: current profile row for the edit form + “must add name” gating. */
export async function GET() {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      supabase: false as const,
      fullName: null,
      boatName: null,
      phone: null,
      avatarPublicUrl: null,
      needsDisplayName: false,
    });
  }

  const row = await getProfileMeRow(user.uid);
  if (!row) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }

  return NextResponse.json({
    supabase: true as const,
    fullName: row.fullName,
    boatName: row.boatName,
    phone: row.phone,
    avatarPublicUrl: row.avatarPublicUrl,
    needsDisplayName: row.needsDisplayName,
  });
}

/** Signed-in: update name / boat / phone / avatar (merges with existing row). */
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Profile sync requires Supabase." }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  const nameErr = validateProfileDisplayName(fullName);
  if (nameErr) {
    return NextResponse.json({ error: nameErr }, { status: 400 });
  }

  const boatName = typeof body.boatName === "string" ? body.boatName : undefined;
  const phone = typeof body.phone === "string" ? normalisePhone(body.phone) : undefined;
  const avatarDataUrl =
    "avatarDataUrl" in body
      ? typeof body.avatarDataUrl === "string" && body.avatarDataUrl.trim().startsWith("data:image/")
        ? body.avatarDataUrl.trim()
        : body.avatarDataUrl === null || body.avatarDataUrl === ""
          ? null
          : undefined
      : undefined;

  const prev = await readProfilePayloadForMerge(user.uid);
  const merged: SignUpProfilePayload = {
    ...prev,
    fullName: fullName.trim(),
    boatName: boatName !== undefined ? boatName.trim() : prev.boatName,
    phone: phone !== undefined ? phone : prev.phone,
    avatarDataUrl,
  };

  try {
    await upsertProfileAfterSignUp(user.uid, merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save profile";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const });
}
