"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VESSEL_CATEGORIES, type VesselCategoryId, type VesselPaymentProvider } from "@/lib/vessel-classifieds-types";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import {
  ArrowLeft,
  Ship,
  Search,
  Filter,
  AlertTriangle,
  Gift,
  Mail,
  Phone,
  PlusCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Camera,
  Trash2,
  Lock,
  Anchor,
  HelpCircle,
  Check,
} from "lucide-react";
import { VESSEL_FORM_MAX_IMAGES } from "@/lib/vessel-classifieds-form-parse";

type PublicListing = {
  id: string;
  status: "draft" | "active" | "expired" | "removed";
  paymentStatus: "unpaid" | "pending" | "paid";
  paymentProvider: VesselPaymentProvider | null;
  paymentRef: string | null;
  categoryId: VesselCategoryId;
  title: string;
  description: string;
  priceGbp: number | null;
  locationLabel: string | null;
  year: number | null;
  lengthFt: number | null;
  makeModel: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhonePublic: boolean;
  imageUrls: string[];
  createdAt: string;
  expiresAt: string;
  removedAt: string | null;
  isOwner: boolean;
};

function catLabel(id: VesselCategoryId): string {
  return VESSEL_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function VesselClassifiedsClient() {
  const { isMobile, mounted } = useIsMobileApp();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [mine, setMine] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<string>("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catPick, setCatPick] = useState<VesselCategoryId>("sailing_yachts");
  const [priceGbp, setPriceGbp] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [year, setYear] = useState("");
  const [lengthFt, setLengthFt] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhonePublic, setContactPhonePublic] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);

  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<string | null>(null);
  const [reminders, setReminders] = useState<{ id: string; title: string; expiresAt: string; daysLeft: number }[]>([]);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [stripeListingReady, setStripeListingReady] = useState<boolean | null>(null);

  const [freeSlots, setFreeSlots] = useState(0);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [useFreeSlot, setUseFreeSlot] = useState(false);

  const loadFreeSlots = async () => {
    try {
      const r = await fetch("/api/vessels/classifieds/free-slots", { credentials: "same-origin" });
      const d = (await r.json()) as { balance?: number };
      if (r.ok) setFreeSlots(typeof d.balance === "number" ? d.balance : 0);
    } catch {
      setFreeSlots(0);
    }
  };

  useEffect(() => {
    if (freeSlots <= 0) setUseFreeSlot(false);
  }, [freeSlots]);

  useEffect(() => {
    return () => {
      for (const u of previews) URL.revokeObjectURL(u);
    };
  }, [previews]);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/demo/me");
        const d = (await r.json()) as { signedIn?: boolean; email?: string };
        setSignedIn(Boolean(d.signedIn));
        if (typeof d.email === "string" && d.email && !contactEmail) setContactEmail(d.email);
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  useEffect(() => {
    void fetch("/api/stripe/config", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ vesselListing?: boolean }>)
      .then((d) => setStripeListingReady(Boolean(d.vesselListing)))
      .catch(() => setStripeListingReady(false));
  }, []);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set("q", qDebounced);
      if (category) params.set("category", category);
      const r = await fetch(`/api/vessels/classifieds?${params.toString()}`);
      const d = (await r.json()) as { listings?: PublicListing[]; error?: string };
      if (!r.ok) {
        setErr(d.error || "Could not load listings");
        setListings([]);
        return;
      }
      setListings(Array.isArray(d.listings) ? d.listings : []);
    } catch {
      setErr("Network error");
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMine = async () => {
    try {
      const r = await fetch("/api/vessels/classifieds?scope=mine");
      const d = (await r.json()) as { listings?: PublicListing[] };
      if (!r.ok) {
        setMine([]);
        return;
      }
      setMine(Array.isArray(d.listings) ? d.listings : []);
    } catch {
      setMine([]);
    }
  };

  const loadReminders = async () => {
    try {
      const r = await fetch("/api/vessels/classifieds/reminders", { cache: "no-store" });
      const d = (await r.json()) as { items?: unknown; message?: string | null };
      if (!r.ok) {
        setReminders([]);
        setReminderMsg(null);
        return;
      }
      setReminders(
        Array.isArray(d.items)
          ? d.items.filter(
            (x): x is { id: string; title: string; expiresAt: string; daysLeft: number } =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as Record<string, unknown>).id === "string" &&
              typeof (x as Record<string, unknown>).title === "string" &&
              typeof (x as Record<string, unknown>).expiresAt === "string" &&
              typeof (x as Record<string, unknown>).daysLeft === "number",
          )
          : [],
      );
      setReminderMsg(typeof d.message === "string" ? d.message : null);
    } catch {
      setReminders([]);
      setReminderMsg(null);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, category]);

  useEffect(() => {
    if (signedIn) queueMicrotask(() => void loadMine());
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) queueMicrotask(() => void loadFreeSlots());
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    queueMicrotask(() => void loadReminders());
    const id = window.setInterval(() => void loadReminders(), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const [editingId, setEditingId] = useState<string>("");
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    categoryId: VesselCategoryId;
    priceGbp: string;
    locationLabel: string;
    year: string;
    lengthFt: string;
    makeModel: string;
    contactEmail: string;
    contactPhone: string;
    contactPhonePublic: boolean;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [editImages, setEditImages] = useState<File[]>([]);
  const editPreviews = useMemo(() => editImages.map((f) => URL.createObjectURL(f)), [editImages]);

  useEffect(() => {
    return () => {
      for (const u of editPreviews) URL.revokeObjectURL(u);
    };
  }, [editPreviews]);

  const [listingPhotoIdx, setListingPhotoIdx] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<{ listingId: string; urls: string[]; idx: number } | null>(null);

  function listingImageIndex(listingId: string, len: number): number {
    if (len <= 0) return 0;
    const raw = listingPhotoIdx[listingId];
    if (raw == null || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(len - 1, raw));
  }

  function setListingImageIndex(listingId: string, len: number, idx: number) {
    if (len <= 0) return;
    setListingPhotoIdx((m) => ({ ...m, [listingId]: Math.max(0, Math.min(len - 1, idx)) }));
  }

  function bumpListingImage(listingId: string, len: number, delta: number) {
    const cur = listingImageIndex(listingId, len);
    setListingImageIndex(listingId, len, cur + delta);
  }

  function openImageLightbox(listingId: string, urls: string[], idx: number) {
    if (!urls.length) return;
    const i = Math.max(0, Math.min(urls.length - 1, idx));
    setLightbox({ listingId, urls, idx: i });
  }

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightbox(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLightbox((prev) => {
          if (!prev) return null;
          const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx - 1));
          setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
          return { ...prev, idx: nextIdx };
        });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setLightbox((prev) => {
          if (!prev) return null;
          const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx + 1));
          setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
          return { ...prev, idx: nextIdx };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  async function createListing() {
    if (!signedIn) {
      setPostMsg("Sign in to post a boat listing.");
      return;
    }
    setPostMsg(null);
    setPosting(true);
    try {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("description", description);
      fd.set("categoryId", catPick);
      fd.set("priceGbp", priceGbp);
      fd.set("locationLabel", locationLabel);
      fd.set("year", year);
      fd.set("lengthFt", lengthFt);
      fd.set("makeModel", makeModel);
      fd.set("contactEmail", contactEmail);
      fd.set("contactPhone", contactPhone);
      if (contactPhonePublic) fd.set("contactPhonePublic", "1");
      for (const f of images.slice(0, 8)) fd.append("images", f);
      if (useFreeSlot && freeSlots > 0) fd.set("useFreeSlot", "1");

      const r = await fetch("/api/vessels/classifieds", { method: "POST", body: fd, credentials: "same-origin" });
      const d = (await r.json()) as { listing?: PublicListing; error?: string };
      if (!r.ok) {
        setPostMsg(d.error || "Could not create listing");
        return;
      }
      window.location.reload();
    } catch {
      setPostMsg("Network error");
    } finally {
      setPosting(false);
    }
  }

  function startEdit(l: PublicListing) {
    if (!l.isOwner) return;
    setEditMsg(null);
    setEditImages([]);
    setEditingId(l.id);
    setEditDraft({
      title: l.title ?? "",
      description: l.description ?? "",
      categoryId: l.categoryId,
      priceGbp: typeof l.priceGbp === "number" ? String(l.priceGbp) : "",
      locationLabel: l.locationLabel ?? "",
      year: typeof l.year === "number" ? String(l.year) : "",
      lengthFt: typeof l.lengthFt === "number" ? String(l.lengthFt) : "",
      makeModel: l.makeModel ?? "",
      contactEmail: l.contactEmail ?? "",
      contactPhone: l.contactPhone ?? "",
      contactPhonePublic: Boolean(l.contactPhonePublic),
    });
  }

  function cancelEdit() {
    setEditingId("");
    setEditDraft(null);
    setEditImages([]);
    setEditBusy(false);
    setEditMsg(null);
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editingId || editingId !== id) return;
    setEditBusy(true);
    setEditMsg(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("title", editDraft.title);
      fd.set("description", editDraft.description);
      fd.set("categoryId", editDraft.categoryId);
      fd.set("priceGbp", editDraft.priceGbp);
      fd.set("locationLabel", editDraft.locationLabel);
      fd.set("year", editDraft.year);
      fd.set("lengthFt", editDraft.lengthFt);
      fd.set("makeModel", editDraft.makeModel);
      fd.set("contactEmail", editDraft.contactEmail);
      fd.set("contactPhone", editDraft.contactPhone);
      if (editDraft.contactPhonePublic) fd.set("contactPhonePublic", "1");
      for (const f of editImages.slice(0, 8)) fd.append("images", f);
      const r = await fetch("/api/vessels/classifieds", {
        method: "PATCH",
        body: fd,
        credentials: "same-origin",
      });
      const d = (await r.json()) as { listing?: PublicListing; error?: string };
      if (!r.ok || !d.listing) {
        setEditMsg(d.error || "Could not save changes");
        return;
      }
      const next = d.listing;
      setListings((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      setMine((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      cancelEdit();
    } catch {
      setEditMsg("Network error");
    } finally {
      setEditBusy(false);
    }
  }

  async function payPayPal(id: string) {
    setErr(null);
    try {
      const r = await fetch("/api/vessels/classifieds/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = (await r.json()) as { approveUrl?: string; error?: string };
      if (!r.ok || !d.approveUrl) {
        setErr(d.error || "PayPal checkout could not be started");
        return;
      }
      window.location.assign(d.approveUrl);
    } catch {
      setErr("Network error");
    }
  }

  async function payStripe(id: string) {
    setErr(null);
    try {
      const r = await fetch("/api/vessels/classifieds/stripe/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      const d = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !d.url) {
        setErr(d.error || "Stripe checkout could not be started");
        return;
      }
      window.location.assign(d.url);
    } catch {
      setErr("Network error");
    }
  }

  // Handle PayPal return (capture) or Stripe return (verify session); webhook also finalises Stripe.
  useEffect(() => {
    const url = new URL(window.location.href);
    const provider = url.searchParams.get("provider") ?? "";
    const listingId = url.searchParams.get("listing") ?? "";
    const paid = url.searchParams.get("paid") === "1";
    const token = url.searchParams.get("token") ?? ""; // PayPal order id
    const sessionId = url.searchParams.get("session_id") ?? "";
    if (!paid || !listingId) return;

    void (async () => {
      try {
        if (provider === "paypal" && token) {
          await fetch("/api/vessels/classifieds/paypal/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId, orderId: token }),
          });
        } else if (provider === "stripe" && sessionId) {
          await fetch("/api/vessels/classifieds/stripe/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ sessionId }),
          });
        }
      } finally {
        // Clean URL then full refresh so listings and draft state match server
        window.history.replaceState({}, "", "/vessels");
        window.location.reload();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col overflow-x-hidden">
        {/* Immersive Header */}
        <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/for-sale"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
              aria-label="Back to buy &amp; sell"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5 text-left">
                <Ship className="size-4 text-sky-400" />
                <span>Boats for Sale</span>
              </h1>
              <p className="text-[9px] text-zinc-500 text-left">
                Paid vessel classifieds on SeaLink
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 text-left">

          {/* Safety Warning notice */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-md space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Vessel Classifieds Only</span>
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-400">
              This board is for listing complete vessels. To buy or sell parts, chandlery, and kit, open the **Boat Gear** board.
            </p>
          </div>

          {/* Expiry Reminders */}
          {signedIn && reminders.length > 0 && (
            <div className="rounded-2xl border border-orange-500/25 bg-orange-950/20 p-4 shadow-md space-y-3">
              <div className="flex items-center gap-2 text-orange-400">
                <AlertTriangle size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Renewal reminders</span>
              </div>
              {reminderMsg && (
                <p className="text-[10px] text-orange-200/80 leading-normal">{reminderMsg}</p>
              )}
              <div className="space-y-2.5">
                {reminders.slice(0, 3).map((x) => (
                  <div key={`rem-mob-${x.id}`} className="bg-black/35 border border-white/[0.04] rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{x.title || "Boat listing"}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">
                        Expires in <span className="font-bold text-orange-400">{x.daysLeft}</span> days · {new Date(x.expiresAt).toLocaleString("en-GB")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void payPayPal(x.id)}
                        className="flex-1 h-8 rounded-lg bg-green-600 px-3 text-[10px] font-bold text-white transition-all active:scale-95"
                      >
                        Renew (PayPal)
                      </button>
                      {stripeListingReady && (
                        <button
                          type="button"
                          onClick={() => void payStripe(x.id)}
                          className="flex-1 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-[10px] font-bold text-slate-300 transition-all active:scale-95"
                        >
                          Renew (Card)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Promo code slots card */}
          {signedIn && (
            <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3">
              <div className="flex items-center gap-2 text-sky-400">
                <Gift size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Promotional code</span>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-400">
                Complimentary slots: <strong className="text-slate-200">{freeSlots}</strong>. Each slot publishes one boat advert for a full term without £30 checkout.
              </p>
              {redeemMsg && (
                <p className="text-[10px] text-slate-300 leading-normal">{redeemMsg}</p>
              )}
              <div className="flex gap-2">
                <input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-black/45 border border-white/[0.08] text-slate-200 placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={redeemBusy || !redeemCode.trim()}
                  onClick={() => {
                    setRedeemBusy(true);
                    setRedeemMsg(null);
                    void (async () => {
                      try {
                        const r = await fetch("/api/vessels/classifieds/redeem-promo", {
                          method: "POST",
                          credentials: "same-origin",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ code: redeemCode.trim() }),
                        });
                        const d = (await r.json()) as { error?: string; slotsAdded?: number };
                        if (!r.ok) {
                          setRedeemMsg(d.error || "Could not redeem");
                          return;
                        }
                        setRedeemMsg(`Added ${d.slotsAdded ?? 1} slot(s). You can post below using “Use complimentary slot”.`);
                        setRedeemCode("");
                        await loadFreeSlots();
                      } catch {
                        setRedeemMsg("Network error");
                      } finally {
                        setRedeemBusy(false);
                      }
                    })();
                  }}
                  className="h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-bold text-white px-3 transition-all active:scale-95 disabled:opacity-50"
                >
                  {redeemBusy ? "…" : "Redeem"}
                </button>
              </div>
            </div>
          )}

          {/* Search bar & filter dropdown & Post trigger button */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400">
                <Search size={14} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search boats..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-black/45 border border-white/[0.08] text-slate-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500/50"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400">
                  <Filter size={12} />
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[#0c192c] border border-white/[0.08] text-slate-200 focus:outline-none appearance-none font-medium"
                >
                  <option value="" className="bg-[#0c192c] text-white">All Categories</option>
                  {VESSEL_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <a
                href="#post-boat-mobile"
                className="flex items-center gap-1.5 bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs rounded-xl px-3 py-2 transition-all active:scale-95 whitespace-nowrap"
              >
                <PlusCircle size={14} />
                <span>Post Boat</span>
              </a>
            </div>
          </div>

          {/* Active Listings Header */}
          <div className="pt-2 text-left">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Active Listings</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">{listings.length} boats available for purchase.</p>
          </div>

          {err && (
            <p className="rounded-xl border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-400">
              {err}
            </p>
          )}

          {/* Listings List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-8 gap-2">
              <span className="animate-spin inline-block h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full" />
              <span className="text-xs text-zinc-500">Loading listings...</span>
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-[#0c192c]/20 border border-white/[0.04] rounded-2xl p-8 text-center text-xs text-zinc-500">
              No boat listings match.
            </div>
          ) : (
            <ul className="space-y-4">
              {listings.map((l) => (
                <li key={`mob-list-${l.id}`} className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3 relative overflow-hidden">

                  {/* Category and Price tags */}
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 text-left">
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">
                      {catLabel(l.categoryId)}
                    </span>
                    {typeof l.priceGbp === "number" && (
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                        £{l.priceGbp.toLocaleString("en-GB")}
                      </span>
                    )}
                  </div>

                  {editingId === l.id && editDraft ? (
                    /* Mobile Edit Mode Form */
                    <div className="space-y-3 text-left">
                      <label className="block text-[10px] font-bold text-slate-300 uppercase">
                        Title
                        <input
                          value={editDraft.title}
                          onChange={(e) => setEditDraft((p) => (p ? { ...p, title: e.target.value } : p))}
                          className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>

                      <label className="block text-[10px] font-bold text-slate-300 uppercase">
                        Description
                        <textarea
                          rows={4}
                          value={editDraft.description}
                          onChange={(e) => setEditDraft((p) => (p ? { ...p, description: e.target.value } : p))}
                          className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Category
                          <select
                            value={editDraft.categoryId}
                            onChange={(e) =>
                              setEditDraft((p) => (p ? { ...p, categoryId: e.target.value as VesselCategoryId } : p))
                            }
                            className="mt-1 w-full rounded-xl bg-[#0c192c] border border-white/[0.08] px-2 py-2 text-xs text-slate-200 focus:outline-none"
                          >
                            {VESSEL_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Price (GBP)
                          <input
                            inputMode="decimal"
                            value={editDraft.priceGbp}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, priceGbp: e.target.value } : p))}
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Year
                          <input
                            inputMode="numeric"
                            value={editDraft.year}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, year: e.target.value } : p))}
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Length (ft)
                          <input
                            inputMode="decimal"
                            value={editDraft.lengthFt}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, lengthFt: e.target.value } : p))}
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Make / model
                          <input
                            value={editDraft.makeModel}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, makeModel: e.target.value } : p))}
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                      </div>

                      <label className="block text-[10px] font-bold text-slate-300 uppercase">
                        Location
                        <input
                          value={editDraft.locationLabel}
                          onChange={(e) =>
                            setEditDraft((p) => (p ? { ...p, locationLabel: e.target.value } : p))
                          }
                          className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Contact email
                          <input
                            required
                            inputMode="email"
                            value={editDraft.contactEmail}
                            onChange={(e) =>
                              setEditDraft((p) => (p ? { ...p, contactEmail: e.target.value } : p))
                            }
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Telephone
                          <input
                            inputMode="tel"
                            value={editDraft.contactPhone}
                            onChange={(e) =>
                              setEditDraft((p) => (p ? { ...p, contactPhone: e.target.value } : p))
                            }
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-300 uppercase">
                        <input
                          type="checkbox"
                          checked={editDraft.contactPhonePublic}
                          onChange={(e) =>
                            setEditDraft((p) => (p ? { ...p, contactPhonePublic: e.target.checked } : p))
                          }
                        />
                        Show telephone publicly
                      </label>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Add photos
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={l.imageUrls.length >= VESSEL_FORM_MAX_IMAGES}
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (!files.length) return;
                              const room = Math.max(0, VESSEL_FORM_MAX_IMAGES - l.imageUrls.length);
                              setEditImages((prev) => [...prev, ...files].slice(0, room));
                              e.target.value = "";
                            }}
                            className="mt-1 w-full text-xs text-slate-300"
                          />
                        </label>
                        {editPreviews.length > 0 && (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {editPreviews.map((src, i) => (
                              <div key={src} className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
                                <img src={src} alt="" className="h-10 w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setEditImages((prev) => prev.filter((_, idx) => idx !== i))}
                                  className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[8px] font-bold text-white"
                                >
                                  X
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {editMsg && (
                        <p className="rounded-xl border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                          {editMsg}
                        </p>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          disabled={editBusy}
                          onClick={() => void saveEdit(l.id)}
                          className="flex-1 h-9 rounded-xl bg-emerald-600 text-xs font-bold text-white active:scale-95"
                        >
                          {editBusy ? "Saving…" : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEdit()}
                          className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-white/[0.02] text-xs font-bold text-slate-200 active:scale-95"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-100 tracking-tight text-left">{l.title}</h3>
                        <p className="mt-1 text-[11px] text-zinc-400 text-left space-x-2">
                          {l.makeModel && <span className="font-semibold">{l.makeModel}</span>}
                          {l.year && <span>• {l.year}</span>}
                          {l.lengthFt && <span>• {l.lengthFt} ft</span>}
                        </p>
                      </div>

                      {/* Photo Pager */}
                      {l.imageUrls?.length > 0 && (
                        (() => {
                          const urls = l.imageUrls;
                          const idx = listingImageIndex(l.id, urls.length);
                          const cur = urls[idx]!;
                          const multi = urls.length > 1;
                          return (
                            <div className="space-y-2">
                              <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/20 h-48 w-full">
                                {multi && (
                                  <button
                                    type="button"
                                    onClick={() => bumpListingImage(l.id, urls.length, -1)}
                                    className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-95"
                                  >
                                    ‹
                                  </button>
                                )}
                                {multi && (
                                  <button
                                    type="button"
                                    onClick={() => bumpListingImage(l.id, urls.length, 1)}
                                    className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-95"
                                  >
                                    ›
                                  </button>
                                )}
                                <div
                                  onClick={() => setLightbox({ listingId: l.id, urls, idx })}
                                  className="w-full h-full cursor-pointer"
                                >
                                  <img src={cur} alt="" className="h-full w-full object-cover" />
                                </div>
                                {multi && (
                                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 border border-white/5 px-2 py-0.5 text-[9px] font-mono text-white">
                                    {idx + 1} / {urls.length}
                                  </span>
                                )}
                              </div>
                              {multi && (
                                <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
                                  {urls.map((src, i) => (
                                    <button
                                      key={`${l.id}-thumb-mob-${i}`}
                                      type="button"
                                      onClick={() => setListingImageIndex(l.id, urls.length, i)}
                                      className={`shrink-0 h-10 w-12 rounded-lg overflow-hidden border-2 transition-all ${i === idx ? "border-emerald-500 scale-95" : "border-white/[0.06]"
                                        }`}
                                    >
                                      <img src={src} alt="" className="h-full w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}

                      {l.locationLabel && (
                        <p className="text-[10px] text-zinc-500 font-medium text-left">{l.locationLabel}</p>
                      )}

                      <p className="text-xs text-slate-300 leading-relaxed text-left whitespace-pre-wrap">{l.description}</p>

                      {/* Contact and Owner options */}
                      <div className="flex items-center justify-between border-t border-white/[0.04] pt-3 flex-wrap gap-2 text-left">
                        <div className="flex gap-2">
                          {l.contactEmail && (
                            <a
                              href={`mailto:${l.contactEmail}?subject=${encodeURIComponent(`Boat for sale: ${l.title}`)}`}
                              className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 active:bg-emerald-700 text-[10px] font-bold text-white px-3 transition-all active:scale-95"
                            >
                              <Mail size={12} className="mr-1" />
                              Email
                            </a>
                          )}
                          {l.contactPhone && (l.isOwner || l.contactPhonePublic) && (
                            <a
                              href={`tel:${l.contactPhone}`}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] font-bold text-slate-300 px-3 transition-all active:scale-95"
                            >
                              <Phone size={12} className="mr-1" />
                              Call
                            </a>
                          )}
                        </div>

                        {l.isOwner && (
                          <button
                            type="button"
                            onClick={() => startEdit(l)}
                            className="h-8 rounded-lg bg-slate-800 text-[10px] font-bold text-white px-3 active:scale-95 border border-white/[0.08] ml-auto"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </li>
              ))}
            </ul>
          )}

          {/* Post Advert Form Container */}
          <div
            id="post-boat-mobile"
            className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-4 text-left"
          >
            <h2 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">Post a Boat Advert</h2>
            {signedIn === false ? (
              <p className="text-xs text-amber-300 bg-amber-950/25 border border-amber-500/10 p-3 rounded-xl leading-normal">
                Sign in to post a boat listing.{" "}
                <Link className="underline font-bold" href="/sign-in">
                  Sign in
                </Link>
              </p>
            ) : (
              <div className="space-y-3.5">
                {postMsg && (
                  <p className="text-xs text-slate-300 bg-black/20 p-2.5 rounded-xl border border-white/[0.05]">{postMsg}</p>
                )}

                {freeSlots > 0 && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10.5px] leading-relaxed text-emerald-300">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={useFreeSlot}
                      onChange={(e) => setUseFreeSlot(e.target.checked)}
                    />
                    <span>
                      <strong>Use complimentary listing slot</strong> ({freeSlots} left) — publishes immediately without £30 checkout.
                    </span>
                  </label>
                )}

                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. 2012 Lagoon 400 — ready to cruise"
                      className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50"
                    />
                  </label>

                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Description
                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Condition, engine, recent work, why selling…"
                      className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Category
                      <select
                        value={catPick}
                        onChange={(e) => setCatPick(e.target.value as VesselCategoryId)}
                        className="mt-1 w-full rounded-xl bg-[#0c192c] border border-white/[0.08] px-2 py-2 text-xs text-slate-200 focus:outline-none"
                      >
                        {VESSEL_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Price (GBP)
                      <input
                        inputMode="decimal"
                        value={priceGbp}
                        onChange={(e) => setPriceGbp(e.target.value)}
                        placeholder="e.g. 129000"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Year
                      <input
                        inputMode="numeric"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="2012"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Length (ft)
                      <input
                        inputMode="decimal"
                        value={lengthFt}
                        onChange={(e) => setLengthFt(e.target.value)}
                        placeholder="40"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Make / model
                      <input
                        value={makeModel}
                        onChange={(e) => setMakeModel(e.target.value)}
                        placeholder="Lagoon 400"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </label>
                  </div>

                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Location
                    <input
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                      placeholder="e.g. Portsmouth"
                      className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Contact email
                      <input
                        required
                        inputMode="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="crew@example.com"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </label>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">
                        Telephone
                        <input
                          inputMode="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+44 7700..."
                          className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                    <input
                      type="checkbox"
                      checked={contactPhonePublic}
                      onChange={(e) => setContactPhonePublic(e.target.checked)}
                    />
                    Show telephone on listing
                  </label>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Photos (up to 8)
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (!files.length) return;
                          setImages((prev) => [...prev, ...files].slice(0, 8));
                          e.target.value = "";
                        }}
                        className="mt-1 block w-full text-xs text-slate-300"
                      />
                    </label>
                    {previews.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {previews.map((src, i) => (
                          <div key={src} className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
                            <img src={src} alt="" className="h-10 w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[8px] font-bold text-white"
                            >
                              X
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={posting || (useFreeSlot && freeSlots < 1)}
                  onClick={() => void createListing()}
                  className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-xs font-bold text-white transition-all disabled:opacity-50"
                >
                  {posting ? "Creating…" : useFreeSlot && freeSlots > 0 ? "Post with complimentary slot" : "Create draft advert"}
                </button>
              </div>
            )}
          </div>

          {/* Drafts Section */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-4 text-left">
            <h2 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">Your Drafts</h2>
            <p className="text-[10px] text-zinc-500 leading-normal">
              Drafts don’t show publicly until paid. Pay £30 for 6 months to publish.
            </p>
            <div className="space-y-2.5">
              {signedIn === false ? (
                <p className="text-xs text-zinc-500">Sign in to see drafts.</p>
              ) : mine.filter((l) => l.status !== "active").length === 0 ? (
                <p className="text-xs text-zinc-500">No drafts yet.</p>
              ) : (
                mine.filter((l) => l.status !== "active").map((l) => (
                  <div key={`draft-mob-${l.id}`} className="bg-black/35 border border-white/[0.04] rounded-xl p-3 flex flex-col gap-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-100 truncate">{l.title || "Untitled draft"}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">Status: {l.status} · Payment: {l.paymentStatus}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void payPayPal(l.id)}
                        className="flex-1 h-8 rounded-lg bg-green-600 text-[10px] font-bold text-white transition-all active:scale-95"
                      >
                        PayPal (£30)
                      </button>
                      {stripeListingReady && (
                        <button
                          type="button"
                          onClick={() => void payStripe(l.id)}
                          className="flex-1 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] font-bold text-slate-300 transition-all active:scale-95"
                        >
                          Stripe (£30)
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl flex justify-around text-xs shrink-0 font-bold">
            <Link href="/gear" className="text-cyan-400 hover:underline">Boat Gear Board</Link>
            <span className="text-white/[0.1]">•</span>
            <Link href="/for-sale" className="text-cyan-400 hover:underline">Buy & Sell Hub</Link>
          </div>
        </div>

        {/* Lightbox Viewer */}
        {lightbox && lightbox.urls.length > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-4 top-4 z-10 rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 active:scale-95 transition-all"
            >
              Close
            </button>
            {lightbox.urls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox((prev) => {
                      if (!prev) return null;
                      const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx - 1));
                      setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
                      return { ...prev, idx: nextIdx };
                    });
                  }}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-[0.9] transition-all"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox((prev) => {
                      if (!prev) return null;
                      const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx + 1));
                      setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
                      return { ...prev, idx: nextIdx };
                    });
                  }}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-[0.9] transition-all"
                >
                  ›
                </button>
              </>
            )}
            <div className="flex flex-col items-center max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightbox.urls[lightbox.idx]!}
                alt=""
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
              {lightbox.urls.length > 1 && (
                <p className="mt-3.5 text-xs font-semibold text-white/80">
                  {lightbox.idx + 1} / {lightbox.urls.length}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <Link href="/for-sale" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Buy & Sell
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Boats for sale</h1>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Search boats for sale
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title/description…"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <a
            href="#post-boat"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
          >
            Add a boat for sale
          </a>
        </div>
      </div>

      {signedIn && reminders.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Renewal reminders</p>
          {reminderMsg ? <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/80">{reminderMsg}</p> : null}
          <div className="mt-3 space-y-2">
            {reminders.slice(0, 3).map((x) => (
              <div key={`rem-${x.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 dark:border-amber-900/40 dark:bg-zinc-950/30">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{x.title || "Boat listing"}</p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                    Expires in <span className="font-semibold">{x.daysLeft}</span> day{x.daysLeft === 1 ? "" : "s"} ·{" "}
                    {new Date(x.expiresAt).toLocaleString("en-GB")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void payPayPal(x.id)}
                    className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    Renew (PayPal)
                  </button>
                  {stripeListingReady ? (
                    <button
                      type="button"
                      onClick={() => void payStripe(x.id)}
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Renew (card)
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {signedIn ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
          <h2 className="text-base font-semibold text-blue-950 dark:text-blue-100">Promotional code</h2>
          <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-200/90">
            Complimentary slots: <strong>{freeSlots}</strong>. Each slot publishes one boat advert for a full term without
            £30 checkout.
          </p>
          {redeemMsg ? <p className="mt-2 text-sm text-blue-900 dark:text-blue-100">{redeemMsg}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="Enter code"
              className="min-w-[10rem] flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-blue-800 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="button"
              disabled={redeemBusy || !redeemCode.trim()}
              onClick={() => {
                setRedeemBusy(true);
                setRedeemMsg(null);
                void (async () => {
                  try {
                    const r = await fetch("/api/vessels/classifieds/redeem-promo", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code: redeemCode.trim() }),
                    });
                    const d = (await r.json()) as { error?: string; slotsAdded?: number };
                    if (!r.ok) {
                      setRedeemMsg(d.error || "Could not redeem");
                      return;
                    }
                    setRedeemMsg(`Added ${d.slotsAdded ?? 1} slot(s). You can post below using “Use complimentary slot”.`);
                    setRedeemCode("");
                    await loadFreeSlots();
                  } catch {
                    setRedeemMsg("Network error");
                  } finally {
                    setRedeemBusy(false);
                  }
                })();
              }}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {redeemBusy ? "…" : "Redeem"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Post a boat advert moved below listings */}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Browse active listings</h2>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:w-64">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All categories</option>
              {VESSEL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {err ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No boat listings yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {listings.map((l) => (
              <li key={l.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-green-800 dark:text-green-400">
                      {catLabel(l.categoryId)}
                    </p>
                    {editingId === l.id && editDraft ? (
                      <div className="mt-2 grid gap-3">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Title
                          <input
                            value={editDraft.title}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, title: e.target.value } : p))}
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </label>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Description
                          <textarea
                            rows={5}
                            value={editDraft.description}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, description: e.target.value } : p))}
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Category
                            <select
                              value={editDraft.categoryId}
                              onChange={(e) =>
                                setEditDraft((p) => (p ? { ...p, categoryId: e.target.value as VesselCategoryId } : p))
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            >
                              {VESSEL_CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Price (GBP)
                            <input
                              inputMode="decimal"
                              value={editDraft.priceGbp}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, priceGbp: e.target.value } : p))}
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Year
                            <input
                              inputMode="numeric"
                              value={editDraft.year}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, year: e.target.value } : p))}
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </label>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Length (ft)
                            <input
                              inputMode="decimal"
                              value={editDraft.lengthFt}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, lengthFt: e.target.value } : p))}
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </label>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Make / model
                            <input
                              value={editDraft.makeModel}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, makeModel: e.target.value } : p))}
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </label>
                        </div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Location (optional)
                          <input
                            value={editDraft.locationLabel}
                            onChange={(e) =>
                              setEditDraft((p) => (p ? { ...p, locationLabel: e.target.value } : p))
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Contact email
                            <input
                              required
                              inputMode="email"
                              value={editDraft.contactEmail}
                              onChange={(e) =>
                                setEditDraft((p) => (p ? { ...p, contactEmail: e.target.value } : p))
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </label>
                          <div className="grid gap-2">
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              Telephone (optional)
                              <input
                                inputMode="tel"
                                value={editDraft.contactPhone}
                                onChange={(e) =>
                                  setEditDraft((p) => (p ? { ...p, contactPhone: e.target.value } : p))
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                              />
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={editDraft.contactPhonePublic}
                                onChange={(e) =>
                                  setEditDraft((p) => (p ? { ...p, contactPhonePublic: e.target.checked } : p))
                                }
                              />
                              Show telephone number on listing
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Add photos (optional)
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              disabled={l.imageUrls.length >= VESSEL_FORM_MAX_IMAGES}
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                if (!files.length) return;
                                const room = Math.max(0, VESSEL_FORM_MAX_IMAGES - l.imageUrls.length);
                                setEditImages((prev) => [...prev, ...files].slice(0, room));
                                e.target.value = "";
                              }}
                              className="mt-1 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
                            />
                          </label>
                          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {l.imageUrls.length >= VESSEL_FORM_MAX_IMAGES
                              ? `Maximum ${VESSEL_FORM_MAX_IMAGES} photos reached.`
                              : `Up to ${VESSEL_FORM_MAX_IMAGES} photos total · room for ${VESSEL_FORM_MAX_IMAGES - l.imageUrls.length} more.`}
                          </p>
                          {editPreviews.length ? (
                            <div className="mt-2 grid grid-cols-4 gap-2">
                              {editPreviews.map((src, i) => (
                                <div
                                  key={src}
                                  className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                                >
                                  <img src={src} alt="" className="h-16 w-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => setEditImages((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="absolute right-1 top-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black/70"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {editMsg ? (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                            {editMsg}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={editBusy}
                            onClick={() => void saveEdit(l.id)}
                            className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {editBusy ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            type="button"
                            disabled={editBusy}
                            onClick={() => cancelEdit()}
                            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{l.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {l.makeModel ? <span className="mr-2">{l.makeModel}</span> : null}
                          {l.year ? <span className="mr-2">{l.year}</span> : null}
                          {l.lengthFt ? <span>{l.lengthFt} ft</span> : null}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {typeof l.priceGbp === "number" ? (
                      <span className="rounded-lg bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        £{l.priceGbp.toLocaleString("en-GB")}
                      </span>
                    ) : null}
                    {l.isOwner && editingId !== l.id ? (
                      <button
                        type="button"
                        onClick={() => startEdit(l)}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>
                {editingId === l.id ? null : l.imageUrls?.length ? (
                  (() => {
                    const urls = l.imageUrls;
                    const idx = listingImageIndex(l.id, urls.length);
                    const cur = urls[idx]!;
                    const multi = urls.length > 1;
                    return (
                      <div className="mt-3">
                        <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                          {multi ? (
                            <button
                              type="button"
                              aria-label="Previous photo"
                              onClick={() => bumpListingImage(l.id, urls.length, -1)}
                              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg font-semibold text-white shadow hover:bg-black/70"
                            >
                              ‹
                            </button>
                          ) : null}
                          {multi ? (
                            <button
                              type="button"
                              aria-label="Next photo"
                              onClick={() => bumpListingImage(l.id, urls.length, 1)}
                              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg font-semibold text-white shadow hover:bg-black/70"
                            >
                              ›
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                            onClick={() => openImageLightbox(l.id, urls, idx)}
                          >
                            <img src={cur} alt="" className="h-56 w-full object-cover" loading="lazy" />
                          </button>
                          {multi ? (
                            <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
                              {idx + 1} / {urls.length}
                            </p>
                          ) : null}
                        </div>
                        {multi ? (
                          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                            {urls.map((src, i) => (
                              <button
                                key={`${l.id}-thumb-${i}`}
                                type="button"
                                onClick={() => setListingImageIndex(l.id, urls.length, i)}
                                className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === idx
                                  ? "border-green-600 ring-2 ring-green-600/30"
                                  : "border-zinc-200 dark:border-zinc-700"
                                  }`}
                              >
                                <img src={src} alt="" className="h-16 w-20 object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                ) : null}
                {editingId === l.id ? null : l.locationLabel ? <p className="mt-3 text-xs text-zinc-500">{l.locationLabel}</p> : null}
                {editingId === l.id ? null : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{l.description}</p>
                )}

                {editingId === l.id ? null : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {l.contactEmail ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`mailto:${l.contactEmail}?subject=${encodeURIComponent(`Boat for sale: ${l.title}`)}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          Email me
                        </a>
                        <span className="text-xs text-zinc-600 dark:text-zinc-300">{l.contactEmail}</span>
                      </div>
                    ) : null}
                    {l.contactPhone && (l.isOwner || l.contactPhonePublic) ? (
                      <a
                        href={`tel:${l.contactPhone}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Call {l.contactPhone}
                      </a>
                    ) : null}
                  </div>
                )}

              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="post-boat"
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Post a boat advert</h2>
        {signedIn === false ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Sign in to post a boat listing.{" "}
            <Link className="underline" href="/sign-in">
              Sign in
            </Link>
          </p>
        ) : null}
        {postMsg ? <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{postMsg}</p> : null}

        {signedIn && freeSlots > 0 ? (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
            <input
              type="checkbox"
              className="mt-1"
              checked={useFreeSlot}
              onChange={(e) => setUseFreeSlot(e.target.checked)}
            />
            <span>
              <strong>Use complimentary listing slot</strong> ({freeSlots} left) — publishes immediately with no PayPal or
              Stripe step.
            </span>
          </label>
        ) : null}

        <div className="mt-4 grid gap-4">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2012 Lagoon 400 — ready to cruise"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Description
            <textarea
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, engine hours, inventory, recent work, why selling…"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Category
              <select
                value={catPick}
                onChange={(e) => setCatPick(e.target.value as VesselCategoryId)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {VESSEL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Price (GBP)
              <input
                inputMode="decimal"
                value={priceGbp}
                onChange={(e) => setPriceGbp(e.target.value)}
                placeholder="e.g. 129000"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Year
              <input
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2012"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Length (ft)
              <input
                inputMode="decimal"
                value={lengthFt}
                onChange={(e) => setLengthFt(e.target.value)}
                placeholder="e.g. 40"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Make / model
              <input
                value={makeModel}
                onChange={(e) => setMakeModel(e.target.value)}
                placeholder="e.g. Beneteau Oceanis 40"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Location (optional)
            <input
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. Portsmouth"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Contact email
              <input
                required
                inputMode="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="e.g. you@example.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <div className="grid gap-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Telephone (optional)
                <input
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +44 7700 900123"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={contactPhonePublic}
                  onChange={(e) => setContactPhonePublic(e.target.checked)}
                />
                Show telephone number on listing
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Photos (up to 8)
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setImages((prev) => [...prev, ...files].slice(0, 8));
                  e.target.value = "";
                }}
                className="mt-1 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
              />
            </label>
            {previews.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {previews.map((src, i) => (
                  <div key={src} className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    <img src={src} alt="" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white hover:bg-black/70"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={posting || signedIn === false || (useFreeSlot && freeSlots < 1)}
            onClick={() => void createListing()}
            className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? "Creating…" : useFreeSlot && freeSlots > 0 ? "Post with complimentary slot" : "Create draft advert"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Your drafts (pay to publish)</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Drafts don’t show publicly until paid. Pay £30 for 6 months with PayPal
          {stripeListingReady ? " or Stripe (card)" : ""}.
        </p>
        <div className="mt-4 space-y-3">
          {signedIn === false ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Sign in to see your drafts.</p>
          ) : mine.filter((l) => l.status !== "active").length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No drafts yet.</p>
          ) : (
            mine
              .filter((l) => l.status !== "active")
              .map((l) => (
                <div key={l.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{l.title || "Untitled draft"}</p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Status: {l.status} · Payment: {l.paymentStatus}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void payPayPal(l.id)}
                      className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Pay with PayPal (£30)
                    </button>
                    {stripeListingReady ? (
                      <button
                        type="button"
                        onClick={() => void payStripe(l.id)}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Pay with card — Stripe (£30)
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
      {lightbox && lightbox.urls.length ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-3 top-3 z-10 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            Close
          </button>
          {lightbox.urls.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) => {
                    if (!prev) return null;
                    const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx - 1));
                    setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
                    return { ...prev, idx: nextIdx };
                  });
                }}
                className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold text-white hover:bg-white/25 sm:left-4"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) => {
                    if (!prev) return null;
                    const nextIdx = Math.max(0, Math.min(prev.urls.length - 1, prev.idx + 1));
                    setListingPhotoIdx((m) => ({ ...m, [prev.listingId]: nextIdx }));
                    return { ...prev, idx: nextIdx };
                  });
                }}
                className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold text-white hover:bg-white/25 sm:right-4"
              >
                ›
              </button>
            </>
          ) : null}
          <div className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.urls[lightbox.idx]!}
              alt=""
              className="max-h-[85vh] max-w-full object-contain"
            />
            {lightbox.urls.length > 1 ? (
              <p className="mt-3 text-sm font-medium text-white/90">
                {lightbox.idx + 1} / {lightbox.urls.length}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

