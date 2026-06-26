'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Waves, Sparkles, X, RefreshCw } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  lat: number | null;
  lng: number | null;
};

type ApiOk = {
  text: string;
  source?: string;
  model?: string;
  place?: string | null;
  detail?: string;
};
type ApiErr = { error: string };

export function MobileSeasTheDayModal({ open, onClose, lat, lng }: Props) {
  const titleId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const openedRef = useRef(false);
  const prevOpen = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setMessage(null);
      setErr(null);
      openedRef.current = false;
    }
    prevOpen.current = open;
  }, [open]);

  const fetchLine = useCallback(async () => {
    setMessage(null);
    setLoading(true);
    setErr(null);
    try {
      const pinLive = lat != null && lng != null;
      const res = await fetch('/api/life-on-seas-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinLive,
          lat: pinLive ? lat : null,
          lng: pinLive ? lng : null,
          seed: Date.now() + Math.floor(Math.random() * 9999),
        }),
      });
      const data = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok) {
        const fail = data as ApiErr;
        setErr(fail.error || 'Could not load message');
        return;
      }
      const ok = data as ApiOk;
      if (!ok.text?.trim()) {
        setErr('Empty response');
        return;
      }
      setMessage(ok.text.trim());
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => {
    if (!open || openedRef.current) return;
    openedRef.current = true;
    void fetchLine();
  }, [open, fetchLine]);

  // Handle ESC key for closing
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Auto-scroll logic inside the container
  useEffect(() => {
    if (!open || !contentRef.current) return;
    contentRef.current.scrollTop = 0;
  }, [message, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-md animate-fade-in"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#0c2445]/95 to-[#07152c]/98 p-6 shadow-[0_0_50px_-12px_rgba(20,184,166,0.25)] text-left animate-scale-up"
      >
        {/* Decorative background glow */}
        <div className="absolute -right-12 -top-12 size-36 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 size-36 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.03] border border-white/[0.06] text-zinc-400 active:scale-90 transition-all hover:text-white"
          aria-label="Close modal"
        >
          <X size={15} />
        </button>

        {/* Header Icon + Title */}
        <div className="flex flex-col items-center text-center mt-2 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 mb-3 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <h2
            id={titleId}
            className="text-xl font-black bg-gradient-to-r from-teal-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent tracking-tight"
          >
            Sea&apos;s the day!
          </h2>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-teal-400/80">
            On the water reflections!
          </p>
        </div>

        {/* Message Content Box */}
        <div
          ref={contentRef}
          className="min-h-[120px] max-h-[220px] overflow-y-auto rounded-2xl bg-black/25 border border-white/[0.04] p-4 mb-5 text-sm leading-relaxed text-slate-200"
        >
          {message ? (
            <p className="whitespace-pre-line text-slate-300">{message}</p>
          ) : !err ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="size-5 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
              <p className="text-xs text-zinc-500">{loading ? 'Setting course…' : '…'}</p>
            </div>
          ) : null}

          {err ? (
            <div className="rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-xs text-red-300 text-center">
              {err}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchLine()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-sky-500 text-sm font-bold text-white shadow-md shadow-teal-500/10 active:scale-[0.98] disabled:opacity-50 transition-all duration-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching…' : "Another Sea's the day!"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-bold text-zinc-400 active:scale-[0.98] transition-transform hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
