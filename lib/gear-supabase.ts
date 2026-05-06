import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GearListing } from "@/lib/gear-types";
import { isGearCategoryId, isGearListingKind } from "@/lib/gear-types";
import { applyPruneAndReminders } from "@/lib/gear-store-shared";

function rowToListing(r: Record<string, unknown>): GearListing | null {
  if (typeof r.id !== "string" || typeof r.seller_uid !== "string") return null;
  if (typeof r.title !== "string" || typeof r.description !== "string") return null;
  if (typeof r.category_id !== "string" || !isGearCategoryId(r.category_id)) return null;
  if (typeof r.created_at !== "string" || typeof r.expires_at !== "string") return null;
  const kind = typeof r.kind === "string" && isGearListingKind(r.kind) ? r.kind : "sale";
  const imageUrls = Array.isArray(r.image_urls) ? r.image_urls.filter((u): u is string => typeof u === "string").slice(0, 3) : [];

  return {
    id: r.id,
    sellerUid: r.seller_uid,
    kind,
    title: r.title,
    description: r.description,
    categoryId: r.category_id,
    priceLabel: typeof r.price_label === "string" ? r.price_label : null,
    contactEmail: typeof r.contact_email === "string" ? r.contact_email : null,
    contactPhone: typeof r.contact_phone === "string" ? r.contact_phone : null,
    contactPhonePublic: typeof r.contact_phone_public === "boolean" ? r.contact_phone_public : false,
    imageUrls,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    soldAt: typeof r.sold_at === "string" ? r.sold_at : null,
    reminderSentAt: typeof r.reminder_sent_at === "string" ? r.reminder_sent_at : null,
  };
}

function listingToRow(l: GearListing): Record<string, unknown> {
  return {
    id: l.id,
    seller_uid: l.sellerUid,
    kind: l.kind,
    title: l.title,
    description: l.description,
    category_id: l.categoryId,
    price_label: l.priceLabel,
    contact_email: l.contactEmail,
    contact_phone: l.contactPhone,
    contact_phone_public: l.contactPhonePublic,
    image_urls: l.imageUrls,
    created_at: l.createdAt,
    expires_at: l.expiresAt,
    sold_at: l.soldAt,
    reminder_sent_at: l.reminderSentAt,
  };
}

export async function loadGearListings(now: Date): Promise<GearListing[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("gear_listings").select("*");
  if (error) throw new Error(error.message);
  const list = (data ?? []).map((r) => rowToListing(r as Record<string, unknown>)).filter(Boolean) as GearListing[];
  const byId = new Map(list.map((l) => [l.id, l]));
  const working = list.map((l) => ({ ...l }));
  const { next, changed } = applyPruneAndReminders(working, now);

  if (changed) {
    const nextIds = new Set(next.map((l) => l.id));
    for (const l of list) {
      if (!nextIds.has(l.id)) {
        await sb.from("gear_listings").delete().eq("id", l.id);
      }
    }
    for (const l of next) {
      const orig = byId.get(l.id);
      if (orig && orig.reminderSentAt !== l.reminderSentAt) {
        await sb.from("gear_listings").update({ reminder_sent_at: l.reminderSentAt }).eq("id", l.id);
      }
    }
  }

  return next;
}

export async function appendListing(listing: GearListing): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("gear_listings").insert(listingToRow(listing));
  if (error) throw new Error(error.message);
}

export async function updateListing(
  id: string,
  sellerUid: string,
  mutator: (l: GearListing) => GearListing | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { data: row, error: e1 } = await sb.from("gear_listings").select("*").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  const parsed = row ? rowToListing(row as Record<string, unknown>) : null;
  if (!parsed) return { ok: false, error: "Listing not found" };
  if (parsed.sellerUid !== sellerUid) return { ok: false, error: "Not allowed" };
  const updated = mutator(parsed);
  if (updated === null) return { ok: false, error: "Update rejected" };
  const { error: e2 } = await sb.from("gear_listings").update(listingToRow(updated)).eq("id", id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

export async function deleteListing(id: string, sellerUid: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { data: row, error: e1 } = await sb.from("gear_listings").select("seller_uid").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  const su = row && typeof (row as { seller_uid: string }).seller_uid === "string" ? (row as { seller_uid: string }).seller_uid : "";
  if (!su) return { ok: false, error: "Listing not found" };
  if (su !== sellerUid) return { ok: false, error: "Not allowed" };
  const { error: e2 } = await sb.from("gear_listings").delete().eq("id", id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}
