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

export async function upsertProfileAfterSignUp(userUid: string, p: SignUpProfilePayload): Promise<void> {
  if (!isSupabaseConfigured()) return;

  let avatarUrl: string | null = null;
  if (p.avatarDataUrl && p.avatarDataUrl.startsWith("data:image/")) {
    try {
      avatarUrl = await persistAvatarDataUrl(userUid, p.avatarDataUrl);
    } catch {
      avatarUrl = null;
    }
  }

  const sb = supabaseAdmin();
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
      avatar_public_url: avatarUrl,
      updated_at: now,
    },
    { onConflict: "user_uid" },
  );
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
