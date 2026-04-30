"use client";

import { useMemo, useState } from "react";

type Props = {
  className?: string;
};

export function ShareAppLink({ className }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const url = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const text = "Join me on SeaLink — map, weather & sea, and anchor alerts.";

  async function onShare() {
    setHint(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "SeaLink", text, url });
        setHint("Share sheet opened.");
        return;
      }
    } catch {
      // user cancelled or share failed; fall through to links
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setHint("Link copied. Use the buttons below to share via your app of choice.");
      } else {
        setHint(`Copy this link: ${url}`);
      }
    } catch {
      setHint("Sharing isn’t available in this browser.");
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${text} ${url}`.trim());

  return (
    <div className={className}>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Share SeaLink</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Invite someone by SMS, email, or WhatsApp — your phone will open the selected app with the link prefilled.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onShare()}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 sm:mt-0"
          >
            Share app link
          </button>
        </div>

        {hint ? <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">{hint}</p> : null}

        {!navigator.share ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              href={`mailto:?subject=${encodeURIComponent("SeaLink invite")}&body=${encodedText}`}
            >
              Email
            </a>
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              href={`sms:&body=${encodedText}`}
            >
              SMS
            </a>
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              href={`https://wa.me/?text=${encodedText}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <button
              type="button"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(url);
                  setHint("Link copied to clipboard.");
                } catch {
                  setHint(`Copy this link: ${url}`);
                }
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Copy link
            </button>
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">Link: {url ? url : "…"}</p>
      </div>
    </div>
  );
}

