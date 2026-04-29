"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GEAR_CATEGORIES, type GearCategoryId, type GearListingPublic } from "@/lib/gear-types";

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
  const [listings, setListings] = useState<GearListingPublic[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<string>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catPick, setCatPick] = useState<GearCategoryId>("accessories");
  const [priceLabel, setPriceLabel] = useState("");
  const [confirmNotVessel, setConfirmNotVessel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

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
      await fetch("/api/gear/session");
      const params = new URLSearchParams();
      if (qDebounced) params.set("q", qDebounced);
      if (category) params.set("category", category);
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
  }, [qDebounced, category, scope]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/gear/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId: catPick,
          priceLabel: priceLabel.trim() || null,
          confirmNotVessel,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormMsg(data.error || "Could not post");
        return;
      }
      setFormMsg("Listed — thank you.");
      setTitle("");
      setDescription("");
      setPriceLabel("");
      setConfirmNotVessel(false);
      await loadListings();
      await loadReminders();
    } catch {
      setFormMsg("Network error");
    } finally {
      setSubmitting(false);
    }
  };

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
                  {l.priceLabel ? (
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {l.priceLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{l.description}</p>
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Listed {fmtDate(l.createdAt)} · removes on or after {fmtDate(l.expiresAt)} ({l.daysUntilExpiry}
                  {" "}
                  day{l.daysUntilExpiry === 1 ? "" : "s"} left)
                </p>
                {l.isOwner ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void extend(l.id)}
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Extend {listingTtl}
                      {" "}
                      days
                    </button>
                    <button
                      type="button"
                      onClick={() => void markSold(l.id)}
                      className="h-9 rounded-lg bg-zinc-800 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      Mark as sold
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Post equipment</h2>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
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
            disabled={submitting || !confirmNotVessel}
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
