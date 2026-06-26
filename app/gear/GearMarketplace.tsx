"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GEAR_CATEGORIES, type GearCategoryId, type GearListingKind, type GearListingPublic } from "@/lib/gear-types";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import {
  ArrowLeft,
  Anchor,
  Search,
  Filter,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Camera,
  Trash2,
  AlertTriangle,
  Mail,
  Phone,
  Tag,
  AlertCircle,
  Calendar,
  Lock,
  Check,
} from "lucide-react";

type Policy = {
  listingTtlDays: number;
  reminderDaysBefore: number;
  note: string;
};

type ReminderItem = { id: string; title: string; expiresAt: string; daysLeft: number };

function categoryLabel(id: GearCategoryId): string {
  return GEAR_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function GearMarketplace() {
  const { isMobile, mounted } = useIsMobileApp();
  const [lightbox, setLightbox] = useState<{ listingId: string; urls: string[]; idx: number } | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [listings, setListings] = useState<GearListingPublic[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<string>("");
  const [kind, setKind] = useState<"" | GearListingKind>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [postKind, setPostKind] = useState<GearListingKind>("sale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catPick, setCatPick] = useState<GearCategoryId>("accessories");
  const [priceLabel, setPriceLabel] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [confirmNotVessel, setConfirmNotVessel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhonePublic, setContactPhonePublic] = useState(false);

  const [listingPhotoIdx, setListingPhotoIdx] = useState<Record<string, number>>({});

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

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/demo/me");
        const d = (await r.json()) as { signedIn?: boolean; isAdmin?: boolean };
        setSignedIn(Boolean(d.signedIn));
        setIsAdmin(Boolean(d.isAdmin));
      } catch {
        setSignedIn(false);
        setIsAdmin(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/gear/session", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { email?: string };
        if (typeof d.email === "string" && d.email && !contactEmail) setContactEmail(d.email);
      } catch {
        /* ignore */
      }
      try {
        const r2 = await fetch("/api/profiles/me", { cache: "no-store" });
        if (!r2.ok) return;
        const d2 = (await r2.json()) as { phone?: string | null };
        if (typeof d2.phone === "string" && d2.phone && !contactPhone) setContactPhone(d2.phone);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/gear/reminders");
      const data = (await res.json()) as {
        items?: ReminderItem[];
        message?: string | null;
      };
      setReminders(Array.isArray(data.items) ? data.items : []);
      setReminderNote(typeof data.message === "string" ? data.message : null);
    } catch {
      /* ignore */
    }
  }, []);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (qDebounced) params.set("q", qDebounced);
      if (category) params.set("category", category);
      if (kind) params.set("kind", kind);
      if (scope === "mine") params.set("scope", "mine");
      const res = await fetch(`/api/gear/listings?${params.toString()}`);
      const data = (await res.json()) as {
        listings?: GearListingPublic[];
        policy?: Policy;
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error || "Could not load listings");
        setListings([]);
        return;
      }
      setListings(data.listings ?? []);
      setPolicy(data.policy ?? null);
    } catch {
      setErr("Network error");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, category, kind, scope]);

  useEffect(() => {
    queueMicrotask(() => void loadListings());
  }, [loadListings]);

  useEffect(() => {
    queueMicrotask(() => void loadReminders());
  }, [loadReminders]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!signedIn) {
      setFormMsg("Sign in to post an advert.");
      return;
    }
    setFormMsg(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("kind", postKind);
      fd.set("title", title);
      fd.set("description", description);
      fd.set("categoryId", catPick);
      fd.set("priceLabel", priceLabel.trim() || "");
      fd.set("confirmNotVessel", confirmNotVessel ? "true" : "false");
      fd.set("contactEmail", contactEmail.trim());
      fd.set("contactPhone", contactPhone.trim());
      if (contactPhonePublic) fd.set("contactPhonePublic", "1");
      for (const f of images.slice(0, 3)) fd.append("images", f);

      const res = await fetch("/api/gear/listings", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormMsg(data.error || "Could not post");
        return;
      }
      window.location.reload();
    } catch {
      setFormMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const previews = useMemo(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    return urls;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const u of previews) URL.revokeObjectURL(u);
    };
  }, [previews]);

  const extend = async (id: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/gear/listings/${id}/extend`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not extend");
        return;
      }
      await loadListings();
      await loadReminders();
    } catch {
      setErr("Network error");
    }
  };

  const markSold = async (id: string) => {
    if (!window.confirm("Mark this item as sold? It will disappear from the board.")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/gear/listings/${id}/sold`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not update");
        return;
      }
      await loadListings();
      await loadReminders();
    } catch {
      setErr("Network error");
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<GearCategoryId>("accessories");
  const [editPrice, setEditPrice] = useState("");
  const [editKind, setEditKind] = useState<GearListingKind>("sale");

  function startEdit(l: GearListingPublic) {
    setEditingId(l.id);
    setEditTitle(l.title);
    setEditDescription(l.description);
    setEditCategory(l.categoryId);
    setEditPrice(l.priceLabel ?? "");
    setEditKind(l.kind);
  }

  async function saveEdit(id: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/gear/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: editKind,
          title: editTitle,
          description: editDescription,
          categoryId: editCategory,
          priceLabel: editPrice,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not update");
        return;
      }
      setEditingId(null);
      await loadListings();
      await loadReminders();
    } catch {
      setErr("Network error");
    }
  }

  async function removeListing(id: string) {
    if (!window.confirm("Delete this advert? This cannot be undone.")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/gear/listings/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not delete");
        return;
      }
      await loadListings();
      await loadReminders();
    } catch {
      setErr("Network error");
    }
  }

  const fmtDate = useMemo(
    () => (iso: string) =>
      new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [],
  );

  const listingTtl = policy?.listingTtlDays ?? 60;
  const reminderDays = policy?.reminderDaysBefore ?? 7;

  if (mounted && isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col overflow-x-hidden">
        {/* Immersive Header */}
        <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
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
                <Anchor className="size-4 text-sky-400" />
                <span>Boat gear — buy &amp; sell</span>
              </h1>
              <p className="text-[9px] text-zinc-500 text-left">
                Chandlery, kit, and spares marketplace
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 text-left">

          {/* Rules / Policy Info Card */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 shadow-md space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Boat Gear Only</span>
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-400">
              This board is for chandlery, kit, spares, and everything except boats and hulls.
              Listings expire after <strong className="text-slate-200">{listingTtl} days</strong> unless extended.
            </p>
          </div>

          {/* Expiry Reminders */}
          {reminders.length > 0 && (
            <div className="rounded-2xl border border-orange-500/25 bg-orange-950/20 p-4 shadow-md space-y-3">
              <div className="flex items-center gap-2 text-orange-400">
                <AlertTriangle size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Listing Expiry Warning</span>
              </div>
              {reminderNote && (
                <p className="text-[10px] text-orange-200/80 leading-normal">{reminderNote}</p>
              )}
              <div className="space-y-2.5">
                {reminders.map((r) => (
                  <div key={`rem-mob-${r.id}`} className="bg-black/35 border border-white/[0.04] rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{r.title}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">
                        Expires in <span className="font-bold text-orange-400">{r.daysLeft}</span> days ({fmtDate(r.expiresAt)})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void extend(r.id)}
                      className="w-full h-8 rounded-lg bg-orange-700 hover:bg-orange-600 text-[10px] font-bold text-white transition-all active:scale-95"
                    >
                      Extend {listingTtl} Days
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search and Category Filter Card */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400">
                <Search size={14} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search gear, spares, kit..."
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
                  {GEAR_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <a
                href="#post-gear-mobile"
                className="flex items-center gap-1.5 bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs rounded-xl px-3 py-2 transition-all active:scale-95 whitespace-nowrap"
              >
                <PlusCircle size={14} />
                <span>Post Gear</span>
              </a>
            </div>

            {/* Kind Filter Segmented Controls */}
            <div className="grid grid-cols-3 gap-1 bg-black/30 p-0.5 rounded-lg border border-white/[0.04]">
              <button
                type="button"
                onClick={() => setKind("")}
                className={`py-1 text-[10px] font-bold rounded-md transition-all ${kind === ""
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 active:text-white"
                  }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setKind("sale")}
                className={`py-1 text-[10px] font-bold rounded-md transition-all ${kind === "sale"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 active:text-white"
                  }`}
              >
                For Sale
              </button>
              <button
                type="button"
                onClick={() => setKind("wanted")}
                className={`py-1 text-[10px] font-bold rounded-md transition-all ${kind === "wanted"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 active:text-white"
                  }`}
              >
                Wanted
              </button>
            </div>

            {/* Scope Filter Segmented Controls */}
            <div className="grid grid-cols-2 gap-1 bg-black/30 p-0.5 rounded-lg border border-white/[0.04]">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`py-1 text-[10px] font-bold rounded-md transition-all ${scope === "all"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 active:text-white"
                  }`}
              >
                All Listings
              </button>
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={`py-1 text-[10px] font-bold rounded-md transition-all ${scope === "mine"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 active:text-white"
                  }`}
              >
                My Listings
              </button>
            </div>
          </div>

          {/* Active Listings Section Header */}
          <div className="pt-2 text-left">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Active Board</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">{listings.length} equipment postings listed.</p>
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
              <span className="text-xs text-zinc-500">Loading board...</span>
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-[#0c192c]/20 border border-white/[0.04] rounded-2xl p-8 text-center text-xs text-zinc-500">
              No gear listings match.
            </div>
          ) : (
            <ul className="space-y-4">
              {listings.map((l) => (
                <li key={`mob-list-${l.id}`} className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-3 relative overflow-hidden">

                  {/* Category and Price/Kind header */}
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 text-left">
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">
                      {categoryLabel(l.categoryId)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${l.kind === "wanted"
                        ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                        : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        }`}>
                        {l.kind === "wanted" ? "Wanted" : "For Sale"}
                      </span>
                      {l.priceLabel && (
                        <span className="text-xs font-black text-slate-100 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-lg">
                          {l.priceLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {editingId === l.id ? (
                    /* Mobile Edit Mode Form */
                    <div className="space-y-3 text-left">
                      <div className="grid grid-cols-2 gap-1 bg-black/30 p-0.5 rounded-lg border border-white/[0.04] mb-1">
                        <button
                          type="button"
                          onClick={() => setEditKind("sale")}
                          className={`py-1 text-[10px] font-bold rounded-md transition-all ${editKind === "sale"
                            ? "bg-emerald-600 text-white shadow"
                            : "text-slate-400"
                            }`}
                        >
                          For Sale
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditKind("wanted")}
                          className={`py-1 text-[10px] font-bold rounded-md transition-all ${editKind === "wanted"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400"
                            }`}
                        >
                          Wanted
                        </button>
                      </div>

                      <label className="block text-[10px] font-bold text-slate-300 uppercase">
                        Title
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>

                      <label className="block text-[10px] font-bold text-slate-300 uppercase">
                        Description
                        <textarea
                          rows={4}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Category
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as GearCategoryId)}
                            className="mt-1 w-full rounded-xl bg-[#0c192c] border border-white/[0.08] px-2 py-2 text-xs text-slate-200 focus:outline-none"
                          >
                            {GEAR_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase">
                          Price / Info
                          <input
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="mt-1 w-full rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </label>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(l.id)}
                          className="flex-1 h-9 rounded-xl bg-emerald-600 text-xs font-bold text-white active:scale-95"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-white/[0.02] text-xs font-bold text-slate-200 active:scale-95"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Details Display Mode */
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-100 tracking-tight text-left">{l.title}</h3>
                        <p className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
                          <Calendar size={10} />
                          <span>Listed {fmtDate(l.createdAt)} · {l.daysUntilExpiry} days left</span>
                        </p>
                      </div>

                      {/* Image Viewer */}
                      {l.imageUrls?.length > 0 && (
                        (() => {
                          const urls = l.imageUrls;
                          const idx = listingImageIndex(l.id, urls.length);
                          const cur = urls[idx]!;
                          const multi = urls.length > 1;
                          return (
                            <div className="space-y-2">
                              <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/20 h-44 w-full">
                                {multi && (
                                  <button
                                    type="button"
                                    onClick={() => bumpListingImage(l.id, urls.length, -1)}
                                    className="absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-95"
                                  >
                                    ‹
                                  </button>
                                )}
                                {multi && (
                                  <button
                                    type="button"
                                    onClick={() => bumpListingImage(l.id, urls.length, 1)}
                                    className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 border border-white/5 text-white active:scale-95"
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
                                  {urls.slice(0, 3).map((src, i) => (
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

                      <p className="text-xs text-slate-300 leading-relaxed text-left whitespace-pre-wrap">{l.description}</p>

                      {/* Contact & Utility Actions Footer */}
                      <div className="flex items-center justify-between border-t border-white/[0.04] pt-3 flex-wrap gap-2 text-left">
                        <div className="flex gap-2">
                          {l.contactEmail && (
                            <a
                              href={`mailto:${l.contactEmail}?subject=${encodeURIComponent(`Boat gear ${l.kind === "wanted" ? "wanted" : "for sale"}: ${l.title}`)}`}
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

                        {l.isOwner || isAdmin ? (
                          <div className="flex gap-1.5 ml-auto">
                            {l.daysUntilExpiry > 0 && l.daysUntilExpiry <= reminderDays && (
                              <button
                                type="button"
                                onClick={() => void extend(l.id)}
                                className="h-8 rounded-lg bg-orange-700 hover:bg-orange-600 text-[10px] font-bold text-white px-2.5 active:scale-95"
                              >
                                Extend
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void markSold(l.id)}
                              className="h-8 rounded-lg bg-slate-800 text-[10px] font-bold text-white px-2.5 active:scale-95 border border-white/[0.08]"
                            >
                              Sold
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(l)}
                              className="h-8 rounded-lg bg-slate-800 text-[10px] font-bold text-white px-2.5 active:scale-95 border border-white/[0.08]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeListing(l.id)}
                              className="h-8 rounded-lg bg-red-900/50 hover:bg-red-800/60 text-[10px] font-bold text-red-200 px-2.5 active:scale-95 border border-red-500/20"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Post Gear Listing Card */}
          <div
            id="post-gear-mobile"
            className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-lg backdrop-blur-md space-y-4 text-left"
          >
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
              <div className="flex items-center gap-2">
                <PlusCircle size={14} className="text-zinc-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Post Equipment Advert</span>
              </div>
            </div>

            {signedIn === false ? (
              <div className="rounded-xl border border-amber-500/10 bg-amber-950/20 p-3.5 text-xs text-amber-200 leading-normal text-left">
                Sign in to post or manage adverts.
              </div>
            ) : (
              <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
                {formMsg && (
                  <p className="text-xs text-red-400">{formMsg}</p>
                )}

                <div className="grid grid-cols-2 gap-1 bg-black/30 p-0.5 rounded-lg border border-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setPostKind("sale")}
                    className={`py-1.5 text-[10px] font-bold rounded-md transition-all ${postKind === "sale"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400"
                      }`}
                  >
                    For Sale
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostKind("wanted")}
                    className={`py-1.5 text-[10px] font-bold rounded-md transition-all ${postKind === "wanted"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400"
                      }`}
                  >
                    Wanted
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Title
                    <input
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Lewmar 40 winches"
                      className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    />
                  </label>

                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Description
                    <textarea
                      required
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Specify condition, size, age, any spares included..."
                      className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Category
                      <select
                        value={catPick}
                        onChange={(e) => setCatPick(e.target.value as GearCategoryId)}
                        className="mt-1 w-full rounded-xl bg-[#0c192c] border border-white/[0.08] px-2 py-2 text-xs text-slate-200 focus:outline-none"
                      >
                        {GEAR_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#0c192c] text-white">
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Price (Optional)
                      <input
                        value={priceLabel}
                        onChange={(e) => setPriceLabel(e.target.value)}
                        placeholder="e.g. £120 or swap"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Contact Email
                      <input
                        required
                        inputMode="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="e.g. you@example.com"
                        className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                      />
                    </label>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">
                        Phone (Optional)
                        <input
                          inputMode="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="e.g. +44770..."
                          className="mt-1 w-full rounded-xl bg-black/45 border border-white/[0.08] px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-[9px] text-zinc-500 font-semibold uppercase">
                        <input
                          type="checkbox"
                          checked={contactPhonePublic}
                          onChange={(e) => setContactPhonePublic(e.target.checked)}
                        />
                        Show publicly
                      </label>
                    </div>
                  </div>

                  {/* Photo Upload */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">
                      Photos (up to 3)
                      <div className="mt-1.5 flex items-center justify-center border border-dashed border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.02] rounded-xl p-4 cursor-pointer relative">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            if (!files.length) return;
                            setImages((prev) => [...prev, ...files].slice(0, 3));
                            e.target.value = "";
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center gap-1">
                          <Camera size={18} className="text-sky-400" />
                          <span className="text-[10px] font-bold text-slate-300">Tap to Select Photos</span>
                        </div>
                      </div>
                    </label>

                    {previews.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {previews.map((src, i) => (
                          <div key={`post-pre-${src}`} className="relative h-12 rounded-lg overflow-hidden border border-white/[0.06]">
                            <img src={src} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-md p-0.5"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[10px] text-zinc-400 mt-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={confirmNotVessel}
                      onChange={(e) => setConfirmNotVessel(e.target.checked)}
                    />
                    <span className="leading-snug">
                      I confirm this is boat equipment or gear — <strong>not a boat, dinghy hull, or bare hull</strong> for sale.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting || !confirmNotVessel || signedIn !== true}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed pt-0.5"
                  >
                    {submitting ? "Posting..." : "Post Listing"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Lightbox popup modal */}
        {lightbox && lightbox.urls.length > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-4 top-4 z-10 rounded-full h-8 w-8 bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-90 transition-all"
            >
              <X size={16} />
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
                >
                  <ChevronLeft size={20} />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            <div className="flex flex-col items-center max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightbox.urls[lightbox.idx]!}
                alt=""
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl border border-white/5"
              />
              {lightbox.urls.length > 1 && (
                <p className="mt-4 text-xs font-mono font-medium text-white/70">
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/for-sale" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
        ← Buy & Sell
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Boat gear — buy &amp; sell
      </h1>
      <div className="mt-4 flex">
        <a
          href="#post-gear"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
        >
          Post your item
        </a>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Member listings for chandlery, kit, and spares. Search by title or description, filter by category, and manage
        your own posts — sold items drop off the board; everything else expires on a rolling schedule unless you
        extend.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Boat equipment &amp; gear only</p>
          <p className="mt-1 opacity-90">
            This board is for chandlery, kit, spares, and everything except boats and hulls.
          </p>
          <p className="mt-2 opacity-90">
            Listings are removed automatically after about {listingTtl}
            {" "}
            days unless you extend. You&apos;ll see an in-app reminder in the last {reminderDays}
            {" "}
            days with a button to add another {listingTtl}
            {" "}
            days.
          </p>
        </div>

        {reminders.length > 0 ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50/90 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/35 dark:text-orange-50">
            <p className="text-sm font-semibold text-orange-950 dark:text-orange-100">Reminder — listing expiry</p>
            {reminderNote ? <p className="mt-1 text-sm text-orange-900/90 dark:text-orange-100/90">{reminderNote}</p> : null}
            <ul className="mt-3 space-y-2">
              {reminders.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-orange-200/80 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-orange-900/40 dark:bg-zinc-950/50"
                >
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.title}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {r.daysLeft}
                      {" "}
                      day{r.daysLeft === 1 ? "" : "s"} left · removes after {fmtDate(r.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void extend(r.id)}
                    className="h-9 shrink-0 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500"
                  >
                    Extend {listingTtl}
                    {" "}
                    days
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Search &amp; filter</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[min(100%,220px)] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Search title or description
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. anchor, VHF, wetsuit…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-green-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="block w-full min-w-[160px] text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:w-48">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">All categories</option>
                {GEAR_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKind("")}
                className={`h-9 rounded-lg px-3 text-sm font-medium ${kind === "" ? "bg-green-600 text-white" : "border border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setKind("sale")}
                className={`h-9 rounded-lg px-3 text-sm font-medium ${kind === "sale" ? "bg-green-600 text-white" : "border border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"}`}
              >
                For sale
              </button>
              <button
                type="button"
                onClick={() => setKind("wanted")}
                className={`h-9 rounded-lg px-3 text-sm font-medium ${kind === "wanted" ? "bg-green-600 text-white" : "border border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"}`}
              >
                Wanted
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`h-9 rounded-lg px-3 text-sm font-medium ${scope === "all" ? "bg-green-600 text-white" : "border border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"}`}
              >
                All listings
              </button>
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={`h-9 rounded-lg px-3 text-sm font-medium ${scope === "mine" ? "bg-green-600 text-white" : "border border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"}`}
              >
                My listings
              </button>
            </div>
          </div>
        </section>

        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Board</h2>
          {loading ? (
            <p className="mt-3 text-sm text-zinc-500">Loading…</p>
          ) : listings.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No listings match. Try another search or post the first one below.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {listings.map((l) => (
                <li
                  key={l.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-green-800 dark:text-green-400">
                        {categoryLabel(l.categoryId)}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{l.title}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${l.kind === "wanted" ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"}`}>
                        {l.kind === "wanted" ? "Wanted" : "For sale"}
                      </span>
                      {l.priceLabel ? (
                        <span className="rounded-lg bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                          {l.priceLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {editingId === l.id ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditKind("sale")}
                          className={`h-9 rounded-lg px-3 text-sm font-semibold ${editKind === "sale" ? "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
                        >
                          For sale
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditKind("wanted")}
                          className={`h-9 rounded-lg px-3 text-sm font-semibold ${editKind === "wanted" ? "bg-indigo-700 text-white hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
                        >
                          Wanted
                        </button>
                      </div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Title
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Description
                        <textarea
                          rows={4}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Category
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as GearCategoryId)}
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                          >
                            {GEAR_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Price
                          <input
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(l.id)}
                          className="h-9 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{l.description}</p>
                  )}
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
                            <a
                              href={cur}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={cur} alt="" className="h-56 w-full object-cover" loading="lazy" />
                            </a>
                            {multi ? (
                              <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
                                {idx + 1} / {urls.length}
                              </p>
                            ) : null}
                          </div>
                          {multi ? (
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                              {urls.slice(0, 3).map((src, i) => (
                                <button
                                  key={`${l.id}-thumb-${i}`}
                                  type="button"
                                  onClick={() => setListingImageIndex(l.id, urls.length, i)}
                                  className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === idx
                                    ? "border-green-600 ring-2 ring-green-600/30"
                                    : "border-zinc-200 dark:border-zinc-700"
                                    }`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="" className="h-16 w-20 object-cover" loading="lazy" />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : null}
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Listed {fmtDate(l.createdAt)} · removes on or after {fmtDate(l.expiresAt)} ({l.daysUntilExpiry}
                    {" "}
                    day{l.daysUntilExpiry === 1 ? "" : "s"} left)
                  </p>
                  {editingId === l.id ? null : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.contactEmail ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`mailto:${l.contactEmail}?subject=${encodeURIComponent(`Boat gear ${l.kind === "wanted" ? "wanted" : "for sale"}: ${l.title}`)}`}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                          >
                            Email me
                          </a>
                          <span className="text-xs text-zinc-600 dark:text-zinc-300">{l.contactEmail}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600 dark:text-zinc-300">Contact email not provided.</span>
                      )}
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
                  {l.isOwner || isAdmin ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.daysUntilExpiry > 0 && l.daysUntilExpiry <= reminderDays ? (
                        <button
                          type="button"
                          onClick={() => void extend(l.id)}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Extend {listingTtl}
                          {" "}
                          days
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void markSold(l.id)}
                        className="h-9 rounded-lg bg-zinc-800 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
                      >
                        Mark as sold
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(l)}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeListing(l.id)}
                        className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/55"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 id="post-gear" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Post equipment
          </h2>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
            {signedIn === false ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                Sign in to post or manage adverts.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPostKind("sale")}
                className={`h-9 rounded-lg px-3 text-sm font-semibold ${postKind === "sale" ? "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
              >
                For sale
              </button>
              <button
                type="button"
                onClick={() => setPostKind("wanted")}
                className={`h-9 rounded-lg px-3 text-sm font-semibold ${postKind === "wanted" ? "bg-indigo-700 text-white hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
              >
                Wanted
              </button>
            </div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Description
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Category
                <select
                  value={catPick}
                  onChange={(e) => setCatPick(e.target.value as GearCategoryId)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {GEAR_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  {GEAR_CATEGORIES.find((c) => c.id === catPick)?.hint}
                </span>
              </label>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Price (optional)
                <input
                  value={priceLabel}
                  onChange={(e) => setPriceLabel(e.target.value)}
                  placeholder="e.g. £120, offers, swap for…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
            </div>
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
                Photos (up to 3)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    setImages((prev) => [...prev, ...files].slice(0, 3));
                    e.target.value = "";
                  }}
                  className="mt-1 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
                />
              </label>
              {previews.length ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {previews.map((src, i) => (
                    <div
                      key={src}
                      className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    >
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
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Optional — add clear shots of labels, condition, and any damage.
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={confirmNotVessel}
                onChange={(e) => setConfirmNotVessel(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-400 text-green-600"
              />
              <span>I confirm this is boat equipment or gear — not a boat, dinghy hull, or bare hull for sale.</span>
            </label>
            <button
              type="submit"
              disabled={submitting || !confirmNotVessel || signedIn !== true}
              className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post listing"}
            </button>
            {formMsg ? <p className="text-sm text-green-800 dark:text-green-300">{formMsg}</p> : null}
          </form>
        </section>
      </div>
    </main>
  );
}
