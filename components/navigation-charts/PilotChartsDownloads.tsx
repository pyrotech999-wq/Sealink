"use client";

import { useEffect, useState } from "react";

import { OPENCPN_PILOT_CHARTS_PAGE } from "@/lib/navigation-charts/opencpn-pilot-charts-catalog";
import type { PilotArchiveHeadRow, PilotDownloadApiItem } from "@/lib/navigation-charts/pilot-charts-manifest";

type ApiPayload = {
  sourcePage: string;
  manifestCheckedAt: string | null;
  archives: PilotDownloadApiItem[];
  md5: { label: string; downloadUrl: string; head: PilotArchiveHeadRow | null };
};

function formatChecked(h: PilotArchiveHeadRow | null): string | null {
  if (!h?.lastModified) return null;
  try {
    const d = new Date(h.lastModified);
    if (Number.isNaN(d.getTime())) return h.lastModified;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return h.lastModified;
  }
}

export function PilotChartsDownloads() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/navigation-charts/pilot-downloads", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiPayload>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load download list.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 sm:p-5"
      aria-label="OpenCPN pilot chart downloads"
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Download pilot charts</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-sm">
        Same nine regional archives as the OpenCPN page (BSB/KAP inside{" "}
        <span className="font-mono text-zinc-500 dark:text-zinc-500">.7z</span>). Extract with{" "}
        <a
          href="https://www.7-zip.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          7-Zip
        </a>{" "}
        or{" "}
        <a
          href="https://kekaosx.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          Keka
        </a>
        , then upload <span className="font-mono text-zinc-500 dark:text-zinc-500">.kap</span> files here. Charts are
        served from{" "}
        <a
          href={OPENCPN_PILOT_CHARTS_PAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          opencpn.org
        </a>
        ; SeaLink does not mirror the archives.
      </p>

      {data?.manifestCheckedAt ? (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          OpenCPN file freshness last probed (server):{" "}
          <time dateTime={data.manifestCheckedAt}>
            {new Date(data.manifestCheckedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          Optional: set Vercel KV + <span className="font-mono">CRON_SECRET</span> so scheduled checks record{" "}
          <span className="font-mono">Last-Modified</span> here.
        </p>
      )}

      {error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
        {(data?.archives ?? []).map((a) => (
          <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <a
                href={a.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                {a.label}
              </a>
              {a.sublabel ? (
                <span className="text-zinc-600 dark:text-zinc-400"> {a.sublabel}</span>
              ) : null}
              <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">{a.filename}</div>
            </div>
            <div className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
              {formatChecked(a.head) ? (
                <>
                  File <span className="font-medium text-zinc-600 dark:text-zinc-300">Last-Modified</span>:{" "}
                  {formatChecked(a.head)}
                </>
              ) : a.head?.ok === false ? (
                <span className="text-amber-700 dark:text-amber-300">Probe HTTP {a.head.httpStatus}</span>
              ) : (
                "—"
              )}
            </div>
          </li>
        ))}
      </ul>

      {data?.md5 ? (
        <div className="mt-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <a
            href={data.md5.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            {data.md5.label}
          </a>
          <span className="ml-2 font-mono text-[11px] text-zinc-500">md5.txt</span>
        </div>
      ) : null}
    </section>
  );
}
