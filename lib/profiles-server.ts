import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadPublicImage } from "@/lib/supabase/storage";

export type SignUpProfilePayload = {
  fullName?: string;
  boatName?: string;
  phone?: string;
  age?: number | null;
  line1?: string;
  line2?: string;
  city?: string;
  postcode?: string;
  invitedEmails?: string;
  locationAccess?: string;
  avatarDataUrl?: string | null;
};

/**
 * First word of `profiles.full_name` for signed-in greetings (e.g. "Colin" from "Colin Smith").
 * Returns null if Supabase is off, no row, or empty name.
 */
export async function getProfileFirstNameForUser(userUid: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("profiles").select("full_name").eq("user_uid", userUid).maybeSingle();
  if (error || !data) return null;
  const raw =
    typeof (data as { full_name?: unknown }).full_name === "string"
      ? (data as { full_name: string }).full_name.trim()
      : "";
  if (!raw) return null;
  const first = raw.split(/\s+/)[0]?.trim() ?? "";
  if (!first) return null;
  return first.length > 48 ? `${first.slice(0, 48)}…` : first;
}

/**
 * When `avatarDataUrl` is a new data-URL, upload and set `avatar_public_url`.
 * When it is `null`, clear the stored avatar URL.
 * When omitted / undefined, keep the existing `avatar_public_url` (for partial updates).
 */
export async function upsertProfileAfterSignUp(userUid: string, p: SignUpProfilePayload): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = supabaseAdmin();
  let avatarPublic: string | null;
  if (typeof p.avatarDataUrl === "string" && p.avatarDataUrl.trim().startsWith("data:image/")) {
    try {
      avatarPublic = await persistAvatarDataUrl(userUid, p.avatarDataUrl);
    } catch {
      avatarPublic = null;
    }
  } else if (p.avatarDataUrl === null) {
    avatarPublic = null;
  } else {
    const { data: prev } = await sb.from("profiles").select("avatar_public_url").eq("user_uid", userUid).maybeSingle();
    const u =
      prev && typeof (prev as { avatar_public_url?: unknown }).avatar_public_url === "string"
        ? (prev as { avatar_public_url: string }).avatar_public_url.trim()
        : "";
    avatarPublic = u || null;
  }

  const now = new Date().toISOString();
  await sb.from("profiles").upsert(
    {
      user_uid: userUid,
      full_name: p.fullName?.trim() || null,
      boat_name: p.boatName?.trim() || null,
      phone: p.phone?.trim() || null,
      age: p.age != null && Number.isFinite(p.age) ? Math.round(p.age) : null,
      line1: p.line1?.trim() || null,
      line2: p.line2?.trim() || null,
      city: p.city?.trim() || null,
      postcode: p.postcode?.trim() || null,
      invited_emails: p.invitedEmails?.trim() || null,
      location_access: p.locationAccess?.trim() || null,
      avatar_public_url: avatarPublic,
      updated_at: now,
    },
    { onConflict: "user_uid" },
  );
}

/** Load editable text fields from `profiles` for merge-before-upsert (no avatar data URL). */
export async function readProfilePayloadForMerge(userUid: string): Promise<SignUpProfilePayload> {
  if (!isSupabaseConfigured()) return {};
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("full_name, boat_name, phone, age, line1, line2, city, postcode, invited_emails, location_access")
    .eq("user_uid", userUid)
    .maybeSingle();
  if (error || !data) return {};
  const r = data as Record<string, unknown>;
  return {
    fullName: typeof r.full_name === "string" ? r.full_name : "",
    boatName: typeof r.boat_name === "string" ? r.boat_name : "",
    phone: typeof r.phone === "string" ? r.phone : "",
    age: typeof r.age === "number" && Number.isFinite(r.age) ? Math.round(r.age) : null,
    line1: typeof r.line1 === "string" ? r.line1 : "",
    line2: typeof r.line2 === "string" ? r.line2 : "",
    city: typeof r.city === "string" ? r.city : "",
    postcode: typeof r.postcode === "string" ? r.postcode : "",
    invitedEmails: typeof r.invited_emails === "string" ? r.invited_emails : "",
    locationAccess: typeof r.location_access === "string" ? r.location_access : "",
  };
}

export type ProfileMeRow = {
  fullName: string | null;
  boatName: string | null;
  phone: string | null;
  avatarPublicUrl: string | null;
  /** True when `full_name` is missing or too short — user must visit Edit profile. */
  needsDisplayName: boolean;
};

export async function getProfileMeRow(userUid: string): Promise<ProfileMeRow | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("full_name, boat_name, phone, avatar_public_url")
    .eq("user_uid", userUid)
    .maybeSingle();
  if (error) return null;
  const r = data as {
    full_name?: string | null;
    boat_name?: string | null;
    phone?: string | null;
    avatar_public_url?: string | null;
  } | null;
  if (!r) {
    return {
      fullName: null,
      boatName: null,
      phone: null,
      avatarPublicUrl: null,
      needsDisplayName: true,
    };
  }
  const fn = typeof r.full_name === "string" ? r.full_name.trim() : "";
  const bn = typeof r.boat_name === "string" ? r.boat_name.trim() : "";
  const ph = typeof r.phone === "string" ? r.phone.trim() : "";
  const av =
    typeof r.avatar_public_url === "string" && r.avatar_public_url.trim() ? r.avatar_public_url.trim() : null;
  const needsDisplayName = fn.length < 2;
  return {
    fullName: fn || null,
    boatName: bn || null,
    phone: ph || null,
    avatarPublicUrl: av,
    needsDisplayName,
  };
}

async function persistAvatarDataUrl(userUid: string, dataUrl: string): Promise<string> {
  const m = /^data:image\/(\w+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) throw new Error("invalid data url");
  const buf = Buffer.from(m[2], "base64");
  const ext = m[1].toLowerCase() === "png" ? "png" : "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const path = `avatars/${userUid}/profile.${ext}`;
  return uploadPublicImage(path, buf, contentType);
}
