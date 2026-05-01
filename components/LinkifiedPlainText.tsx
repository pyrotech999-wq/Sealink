"use client";

import type { ReactNode } from "react";

const URL_SPLIT = /(https?:\/\/[^\s<>]+)/gi;

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** User-visible label; map links get a clear CTA. */
export function linkLabelForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host.includes("google.") &&
      (u.pathname.includes("/maps") || u.searchParams.has("q") || u.search.includes("maps"))
    ) {
      return "Open sender position on map";
    }
    if (host === "maps.apple.com" || host.endsWith(".apple.com")) {
      return "Open sender position on map";
    }
  } catch {
    /* */
  }
  return url;
}

/** First URL in text that looks like a map link (for primary buttons). */
export function firstMapUrlInText(text: string): string | null {
  const re = /https?:\/\/[^\s<>]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lower = raw.toLowerCase();
    if (
      lower.includes("google.com/maps") ||
      lower.includes("maps.google") ||
      lower.includes("goo.gl/maps") ||
      lower.includes("maps.apple.com")
    ) {
      return raw;
    }
  }
  return null;
}

type Props = {
  text: string;
  className?: string;
};

export function LinkifiedPlainText({ text, className }: Props) {
  const segments = text.split(URL_SPLIT);
  const out: ReactNode[] = segments.map((seg, i) => {
    if (isHttpUrl(seg)) {
      return (
        <a
          key={i}
          href={seg}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-semibold text-sky-400 underline decoration-sky-500/60 underline-offset-2 hover:text-sky-300"
        >
          {linkLabelForUrl(seg)}
        </a>
      );
    }
    return seg;
  });
  return <span className={className}>{out}</span>;
}
