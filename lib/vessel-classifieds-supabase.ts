import { supabaseAdmin } from "@/lib/supabase/admin";
import type { VesselClassifiedListing, VesselListingStatus } from "@/lib/vessel-classifieds-types";
import { isVesselCategoryId } from "@/lib/vessel-classifieds-types";
import { applyExpiry } from "@/lib/vessel-classifieds-store-shared";

function rowToListing(r: Record<string, unknown>): VesselClassifiedListing | null {
  if (typeof r.id !== "string" || typeof r.owner_uid !== "string") return null;
  if (typeof r.created_at !== "string" || typeof r.expires_at !== "string") return null;
  if (typeof r.category_id !== "string" || !isVesselCategoryId(r.category_id)) return null;
  if (typeof r.title !== "string" || typeof r.description !== "string") return null;
  const status = (r.status as VesselListingStatus) ?? "draft";
  const imageUrls = Array.isArray(r.image_urls) ? r.image_urls.filter((u): u is string => typeof u === "string").slice(0, 8) : [];

  return {
    id: r.id,
    ownerUid: r.owner_uid,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    removedAt: typeof r.removed_at === "string" ? r.removed_at : null,
    status: status === "active" || status === "expired" || status === "removed" ? status : "draft",
    paymentStatus: r.payment_status === "paid" || r.payment_status === "pending" ? r.payment_status : "unpaid",
    paymentProvider:
      r.payment_provider === "paypal" ||
      r.payment_provider === "stripe" ||
      r.payment_provider === "comp" ||
      r.payment_provider === "promo"
        ? r.payment_provider
        : null,
    paymentRef: typeof r.payment_ref === "string" ? r.payment_ref : null,
    categoryId: r.category_id,
    title: r.title,
    description: r.description,
    priceGbp: typeof r.price_gbp === "number" && Number.isFinite(r.price_gbp) ? r.price_gbp : null,
    locationLabel: typeof r.location_label === "string" ? r.location_label : null,
    year: typeof r.year === "number" && Number.isFinite(r.year) ? r.year : null,
    lengthFt: typeof r.length_ft === "number" && Number.isFinite(r.length_ft) ? r.length_ft : null,
    makeModel: typeof r.make_model === "string" ? r.make_model : null,
    contactEmail: typeof r.contact_email === "string" ? r.contact_email : null,
    contactPhone: typeof r.contact_phone === "string" ? r.contact_phone : null,
    contactPhonePublic: r.contact_phone_public === true,
    imageUrls,
  };
}

function listingToRow(l: VesselClassifiedListing): Record<string, unknown> {
  return {
    id: l.id,
    owner_uid: l.ownerUid,
    created_at: l.createdAt,
    expires_at: l.expiresAt,
    removed_at: l.removedAt,
    status: l.status,
    payment_status: l.paymentStatus,
    payment_provider: l.paymentProvider,
    payment_ref: l.paymentRef,
    category_id: l.categoryId,
    title: l.title,
    description: l.description,
    price_gbp: l.priceGbp,
    location_label: l.locationLabel,
    year: l.year,
    length_ft: l.lengthFt,
    make_model: l.makeModel,
    contact_email: l.contactEmail,
    contact_phone: l.contactPhone,
    contact_phone_public: l.contactPhonePublic,
    image_urls: l.imageUrls,
  };
}

export async function loadVesselClassifieds(now: Date): Promise<VesselClassifiedListing[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("vessel_listings").select("*");
  if (error) throw new Error(error.message);
  const list = (data ?? []).map((r) => rowToListing(r as Record<string, unknown>)).filter(Boolean) as VesselClassifiedListing[];
  const { next, changed } = applyExpiry(list, now);
  if (changed) {
    for (const l of next) {
      const orig = list.find((x) => x.id === l.id);
      if (orig && orig.status !== l.status) {
        await sb.from("vessel_listings").update({ status: l.status }).eq("id", l.id);
      }
    }
  }
  return next;
}

export async function appendVesselListing(listing: VesselClassifiedListing): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("vessel_listings").insert(listingToRow(listing));
  if (error) throw new Error(error.message);
}

export async function updateVesselListing(
  id: string,
  ownerUid: string,
  mutator: (l: VesselClassifiedListing) => VesselClassifiedListing | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { data: row, error: e1 } = await sb.from("vessel_listings").select("*").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  const parsed = row ? rowToListing(row as Record<string, unknown>) : null;
  if (!parsed) return { ok: false, error: "Not found" };
  if (parsed.ownerUid !== ownerUid) return { ok: false, error: "Not allowed" };
  const updated = mutator(parsed);
  if (updated === null) return { ok: false, error: "Update rejected" };
  const { error: e2 } = await sb.from("vessel_listings").update(listingToRow(updated)).eq("id", id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

export async function adminUpdateVesselListing(
  id: string,
  mutator: (l: VesselClassifiedListing) => VesselClassifiedListing | null,
): Promise<{ ok: boolean; error?: string; ownerUid?: string }> {
  const sb = supabaseAdmin();
  const { data: row, error: e1 } = await sb.from("vessel_listings").select("*").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  const parsed = row ? rowToListing(row as Record<string, unknown>) : null;
  if (!parsed) return { ok: false, error: "Not found" };
  const updated = mutator(parsed);
  if (updated === null) return { ok: false, error: "Update rejected" };
  const { error: e2 } = await sb.from("vessel_listings").update(listingToRow(updated)).eq("id", id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true, ownerUid: parsed.ownerUid };
}
