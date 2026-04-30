"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VESSEL_CATEGORIES, type VesselCategoryId } from "@/lib/vessel-classifieds-types";

type PublicListing = {
  id: string;
  status: "draft" | "active" | "expired" | "removed";
  paymentStatus: "unpaid" | "pending" | "paid";
  paymentProvider: "paypal" | null;
  paymentRef: string | null;
  categoryId: VesselCategoryId;
  title: string;
  description: string;
  priceGbp: number | null;
  locationLabel: string | null;
  year: number | null;
  lengthFt: number | null;
  makeModel: string | null;
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
  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);

  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<string | null>(null);

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
        const d = (await r.json()) as { signedIn?: boolean };
        setSignedIn(Boolean(d.signedIn));
      } catch {
        setSignedIn(false);
      }
    })();
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

  useEffect(() => {
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, category]);

  useEffect(() => {
    if (signedIn) queueMicrotask(() => void loadMine());
  }, [signedIn]);

  async function createListing() {
    if (!signedIn) {
      setPostMsg("Sign in to post a vessel classified.");
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
      for (const f of images.slice(0, 3)) fd.append("images", f);

      const r = await fetch("/api/vessels/classifieds", { method: "POST", body: fd });
      const d = (await r.json()) as { listing?: PublicListing; error?: string };
      if (!r.ok) {
        setPostMsg(d.error || "Could not create listing");
        return;
      }
      setPostMsg("Draft created. Choose a payment provider below to publish for 6 months.");
      setTitle("");
      setDescription("");
      setPriceGbp("");
      setLocationLabel("");
      setYear("");
      setLengthFt("");
      setMakeModel("");
      setImages([]);
      await load();
      await loadMine();
    } catch {
      setPostMsg("Network error");
    } finally {
      setPosting(false);
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

  // Handle PayPal return (best effort, no webhook yet).
  useEffect(() => {
    const url = new URL(window.location.href);
    const provider = url.searchParams.get("provider") ?? "";
    const listingId = url.searchParams.get("listing") ?? "";
    const paid = url.searchParams.get("paid") === "1";
    const token = url.searchParams.get("token") ?? ""; // PayPal order id
    if (!paid || !listingId) return;

    void (async () => {
      try {
        if (provider === "paypal" && token) {
          await fetch("/api/vessels/classifieds/paypal/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId, orderId: token }),
          });
        }
      } finally {
        // Clean URL
        window.history.replaceState({}, "", "/vessels");
        await load();
        await loadMine();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Vessel classifieds</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Paid vessel adverts run for <strong>6 months</strong>. Price: <strong>£30</strong> per listing (PayPal).
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Post a vessel advert</h2>
        {signedIn === false ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Sign in to post a vessel classified.
            {" "}
            <Link className="underline" href="/sign-in">
              Sign in
            </Link>
          </p>
        ) : null}
        {postMsg ? <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{postMsg}</p> : null}

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
            disabled={posting || signedIn === false}
            onClick={() => void createListing()}
            className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? "Creating…" : "Create draft advert"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Browse active listings</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title/description…"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
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
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No vessel classifieds yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {listings.map((l) => (
              <li key={l.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-green-800 dark:text-green-400">
                      {catLabel(l.categoryId)}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{l.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {l.makeModel ? <span className="mr-2">{l.makeModel}</span> : null}
                      {l.year ? <span className="mr-2">{l.year}</span> : null}
                      {l.lengthFt ? <span>{l.lengthFt} ft</span> : null}
                    </p>
                  </div>
                  {typeof l.priceGbp === "number" ? (
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      £{l.priceGbp.toLocaleString("en-GB")}
                    </span>
                  ) : null}
                </div>
                {l.locationLabel ? <p className="mt-2 text-xs text-zinc-500">{l.locationLabel}</p> : null}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{l.description}</p>
                {l.imageUrls?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {l.imageUrls.slice(0, 3).map((src) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <img src={src} alt="" className="h-24 w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Your drafts (pay to publish)</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Drafts don’t show publicly until paid. Use PayPal to publish for 6 months.
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
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
    </main>
  );
}

