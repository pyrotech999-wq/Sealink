"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VESSEL_CATEGORIES, type VesselCategoryId } from "@/lib/vessel-classifieds-types";

type PromoRow = {
  id: string;
  codeNorm: string;
  label: string | null;
  maxUses: number;
  uses: number;
  slotsPerRedeem: number;
  expiresAt: string | null;
  createdAt: string;
};

export function AdminVesselAdvertsClient() {
  const [codes, setCodes] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [maxUses, setMaxUses] = useState("25");
  const [slotsPerRedeem, setSlotsPerRedeem] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");

  const [compListingId, setCompListingId] = useState("");

  const [ownerEmail, setOwnerEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catPick, setCatPick] = useState<VesselCategoryId>("sailing_yachts");
  const [priceGbp, setPriceGbp] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [year, setYear] = useState("");
  const [lengthFt, setLengthFt] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [images, setImages] = useState<File[]>([]);

  const loadCodes = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/vessel-promo-codes", { credentials: "same-origin" });
      const d = (await r.json()) as { codes?: PromoRow[]; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not load codes");
        setCodes([]);
        return;
      }
      setCodes(Array.isArray(d.codes) ? d.codes : []);
    } catch {
      setErr("Network error");
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  async function createCode(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setOkMsg(null);
    try {
      const r = await fetch("/api/admin/vessel-promo-codes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          label: newLabel.trim() || null,
          maxUses: Number(maxUses),
          slotsPerRedeem: Number(slotsPerRedeem),
          expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Create failed");
        return;
      }
      setOkMsg("Promo code created.");
      setNewCode("");
      setNewLabel("");
      await loadCodes();
    } catch {
      setErr("Network error");
    }
  }

  async function compListing(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setOkMsg(null);
    try {
      const r = await fetch("/api/admin/vessel-listings/comp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: compListingId.trim() }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not publish listing");
        return;
      }
      setOkMsg("Listing published for free (complimentary).");
      setCompListingId("");
    } catch {
      setErr("Network error");
    }
  }

  async function createCompedForSeller(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setOkMsg(null);
    try {
      const fd = new FormData();
      fd.set("ownerEmail", ownerEmail.trim());
      fd.set("title", title);
      fd.set("description", description);
      fd.set("categoryId", catPick);
      fd.set("priceGbp", priceGbp);
      fd.set("locationLabel", locationLabel);
      fd.set("year", year);
      fd.set("lengthFt", lengthFt);
      fd.set("makeModel", makeModel);
      for (const f of images.slice(0, 8)) fd.append("images", f);

      const r = await fetch("/api/admin/vessel-listings/create-comped", { method: "POST", body: fd, credentials: "same-origin" });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not create listing");
        return;
      }
      setOkMsg("Live listing created for that seller (no payment).");
      setOwnerEmail("");
      setTitle("");
      setDescription("");
      setImages([]);
    } catch {
      setErr("Network error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Home
        </Link>
        <Link href="/admin/access" className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
          Subscription admin
        </Link>
        <Link href="/vessels" className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400">
          Boats for sale
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Boat adverts & promo codes</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Create promotional codes so users can redeem <strong className="text-zinc-800 dark:text-zinc-200">complimentary listing slots</strong> on{" "}
        <Link href="/vessels" className="underline">
          /vessels
        </Link>
        . Comp an existing draft by listing ID, or create a new live advert for a seller&apos;s sign-in email.
      </p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        Supabase: run migration <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">004_vessel_freelist.sql</code> for codes/slots to
        persist in production. Without it, codes are stored in <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">data/vessel-freelist.json</code>{" "}
        (dev / single-node only).
      </p>

      {err ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          {okMsg}
        </p>
      ) : null}

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Promo codes</h2>
        {loading ? <p className="mt-2 text-sm text-zinc-500">Loading…</p> : null}
        {!loading && codes.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No codes yet.</p> : null}
        {codes.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {codes.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{c.codeNorm}</span>
                {c.label ? <span className="ml-2 text-zinc-600 dark:text-zinc-400">— {c.label}</span> : null}
                <span className="ml-2 text-xs text-zinc-500">
                  uses {c.uses}/{c.maxUses} · {c.slotsPerRedeem} slot(s)/redeem
                  {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleString("en-GB")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={(e) => void createCode(e)} className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">New code</p>
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="e.g. BOATSHOW2026"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Max total redemptions
              <input
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Slots per redemption
              <input
                value={slotsPerRedeem}
                onChange={(e) => setSlotsPerRedeem(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            Expires (optional, local time)
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
            Create code
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Publish existing draft (free)</h2>
        <p className="mt-1 text-xs text-zinc-500">Paste the listing UUID from the seller&apos;s draft row or database.</p>
        <form onSubmit={(e) => void compListing(e)} className="mt-3 flex flex-wrap gap-2">
          <input
            value={compListingId}
            onChange={(e) => setCompListingId(e.target.value)}
            placeholder="Listing id (UUID)"
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button type="submit" className="h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">
            Comp to live
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Create live advert for seller (free)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          <strong>Owner email</strong> must match how they sign in (same normalisation as accounts). Listing goes live immediately.
        </p>
        <form onSubmit={(e) => void createCompedForSeller(e)} className="mt-4 grid gap-3">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Seller email
            <input
              type="email"
              required
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Description
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Category
              <select
                value={catPick}
                onChange={(e) => setCatPick(e.target.value as VesselCategoryId)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {VESSEL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Price (GBP)
              <input
                value={priceGbp}
                onChange={(e) => setPriceGbp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Year
              <input value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50" />
            </label>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Length (ft)
              <input value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50" />
            </label>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Make / model
              <input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50" />
            </label>
          </div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Location (optional)
            <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50" />
          </label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Photos (optional, up to 3)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setImages((prev) => [...prev, ...files].slice(0, 8));
                e.target.value = "";
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
            Create live listing (complimentary)
          </button>
        </form>
      </section>
    </div>
  );
}
