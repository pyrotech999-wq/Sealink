"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GEAR_CATEGORIES, type GearCategoryId, type GearListingKind, type GearListingPublic } from "@/lib/gear-types";

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

  return (
    <div className="flex flex-col gap-8">
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
                                className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                                  i === idx
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
            disabled={submitting || !confirmNotVessel || signedIn === false}
            className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post listing"}
          </button>
          {formMsg ? <p className="text-sm text-green-800 dark:text-green-300">{formMsg}</p> : null}
        </form>
      </section>
    </div>
  );
}
