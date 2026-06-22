'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { getLastKnownPosition } from '@/lib/map-last-known';

export function MobileAiDailySummary() {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const pos = getLastKnownPosition();
      const res = await fetch('/api/life-on-seas-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinLive: pos != null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          seed: Date.now(),
        }),
        cache: 'no-store',
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setErr(data.error ?? 'Could not load daily briefing');
        return;
      }
      setText(data.text?.trim() ?? null);
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const paragraphs = text ? text.split(/\n\n+/).filter(Boolean) : [];
  const previewText = paragraphs[0] ?? '';
  const hasTruncation = paragraphs.length > 1;

  return (
    <div className="mt-4 rounded-2xl border border-violet-500/20 bg-[#0c1a36]/80 shadow-lg backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/20">
            <Sparkles size={13} className="text-violet-400" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">AI Daily Briefing</p>
            <p className="text-xs font-bold text-slate-200 leading-none mt-0.5">Marine Summary</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] active:scale-90 transition-transform disabled:opacity-50"
          aria-label="Refresh daily briefing"
        >
          <RefreshCw size={12} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {loading && !text ? (
          <div className="flex items-center gap-2.5 py-4">
            <div className="size-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />
            <span className="text-xs text-zinc-500 animate-pulse">Generating today&apos;s briefing…</span>
          </div>
        ) : err ? (
          <p className="text-xs text-red-400 py-2">{err}</p>
        ) : text ? (
          <>
            <div className="rounded-xl border border-violet-500/10 bg-violet-950/20 px-3 py-2.5 text-xs leading-relaxed text-zinc-300">
              <p>{previewText}</p>
              {expanded && paragraphs.slice(1).map((para, i) => (
                <p key={i} className="mt-2">{para}</p>
              ))}
            </div>

            {hasTruncation && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="mt-2 text-[10px] font-bold text-violet-400 hover:text-violet-300 active:scale-95 transition-transform"
              >
                {expanded ? '▲ Show less' : '▼ Read full briefing'}
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
