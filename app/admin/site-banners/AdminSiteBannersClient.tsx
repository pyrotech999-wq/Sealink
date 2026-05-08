"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SITE_BANNER_MAX_HEIGHT_REM, SITE_BANNER_MOB_BUTTON_REM } from "@/lib/site-banner-ads-constants";

type Row = {
  id: string;
  imageUrl: string;
  linkUrl: string;
  altText: string;
  sortOrder: number;
  enabled: boolean;
};

const emptyRow = (i: number): Row => ({
  id: "",
  imageUrl: "",
  linkUrl: "",
  altText: "",
  sortOrder: i,
  enabled: true,
});

export function AdminSiteBannersClient() {
  const [max, setMax] = useState(10);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, (_, i) => emptyRow(i)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/site-banner-ads", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as { ads?: Row[]; max?: number; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Could not load");
        return;
      }
      const m = typeof d.max === "number" ? d.max : 10;
      setMax(m);
      const list = Array.isArray(d.ads) ? d.ads : [];
      const next: Row[] = Array.from({ length: m }, (_, i) => emptyRow(i));
      list.slice(0, m).forEach((ad, i) => {
        next[i] = {
          id: typeof ad.id === "string" ? ad.id : "",
          imageUrl: ad.imageUrl ?? "",
          linkUrl: ad.linkUrl ?? "",
          altText: ad.altText ?? "",
          sortOrder: typeof ad.sortOrder === "number" ? ad.sortOrder : i,
          enabled: ad.enabled !== false,
        };
      });
      setRows(next);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = rows
        .filter((r) => r.imageUrl.trim() && r.linkUrl.trim())
        .map((r, i) => ({
          id: r.id.trim() || undefined,
          imageUrl: r.imageUrl.trim(),
          linkUrl: r.linkUrl.trim(),
          altText: r.altText.trim(),
          sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
          enabled: r.enabled,
        }));
      const r = await fetch("/api/admin/site-banner-ads", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ads: payload }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Save failed");
        return;
      }
      setOk("Saved.");
      await load();
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Home
        </Link>
        <Link href="/admin/access" className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
          Admin access
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Site banner ads</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Up to {max} rotating banners appear below the <strong className="text-zinc-800 dark:text-zinc-200">Man overboard</strong>{" "}
        button on Home, Anchor alarm, IFM, Messages, Weather, and Charts. Use direct image URLs (https). Images are scaled down
        automatically; max height is {SITE_BANNER_MAX_HEIGHT_REM}rem (~1.5× the dock MOB button height of ~{SITE_BANNER_MOB_BUTTON_REM}
        rem).
      </p>

      {err ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          {ok}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save all"}
        </button>
      </div>

      <ul className="mt-6 space-y-6">
        {rows.map((row, i) => (
          <li key={i} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slot {i + 1}</span>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, enabled: on } : r)));
                  }}
                />
                Enabled
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Image URL
              <input
                type="url"
                value={row.imageUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => prev.map((r, j) => (j === i ? { ...r, imageUrl: v } : r)));
                }}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Link URL
              <input
                type="url"
                value={row.linkUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => prev.map((r, j) => (j === i ? { ...r, linkUrl: v } : r)));
                }}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Image description (accessibility)
              <input
                type="text"
                value={row.altText}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => prev.map((r, j) => (j === i ? { ...r, altText: v } : r)));
                }}
                placeholder="Short label for screen readers"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Sort order (lower first)
              <input
                type="number"
                value={row.sortOrder}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRows((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, sortOrder: Number.isFinite(v) ? v : 0 } : r)),
                  );
                }}
                className="mt-1 w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            {row.imageUrl.trim() ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-xs text-zinc-500">Preview (scaled as on site)</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.imageUrl}
                  alt=""
                  className="mt-1 max-w-full object-contain"
                  style={{ maxHeight: `${SITE_BANNER_MAX_HEIGHT_REM}rem` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
