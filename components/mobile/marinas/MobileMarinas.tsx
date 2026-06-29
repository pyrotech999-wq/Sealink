'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  MapPin,
  Phone,
  Anchor,
  ChevronDown,
  ChevronUp,
  Send,
  Navigation,
  ArrowLeft,
  CheckCircle,
  Waves,
  CalendarDays,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { type MarinaListing } from '@/lib/marina-types';
import { distanceKm } from '@/lib/geo-haversine';
import { humanGeolocationMessage } from '@/lib/geolocation-utils';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const LIST_FETCH_LIMIT = 2000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildEnquiryBody(
  m: MarinaListing,
  arrival: string,
  departure: string,
  lengthM: string,
  note: string,
): string {
  return [
    'Marina enquiry via SeaLink',
    '',
    `Marina: ${m.name}`,
    `Location: ${m.harbour}, ${m.region}, ${m.country}`,
    `Marina phone: ${m.phone || '(not listed)'}`,
    '',
    `Requested arrival: ${arrival || '(not set)'}`,
    `Requested departure: ${departure || '(not set)'}`,
    `Boat length (m): ${lengthM || '(not set)'}`,
    '',
    note.trim() ? `Notes:\n${note.trim()}` : 'Notes: (none)',
    '',
    '— Sent from SeaLink marina berths.',
  ].join('\n');
}

type SearchFilters = {
  arrival: string;
  departure: string;
  lengthM: string;
};

type EnquiryForm = {
  arrival: string;
  departure: string;
  lengthM: string;
  note: string;
};

type SubmitState = 'idle' | 'busy' | 'ok' | 'error';

// ---------------------------------------------------------------
// Marina list card
// ---------------------------------------------------------------
function MarinaCard({
  marina,
  distKm,
  onSelect,
}: {
  marina: MarinaListing;
  distKm: number | null;
  onSelect: () => void;
}) {
  return (
    <div className="w-full rounded-2xl border border-white/[0.07] bg-[#0c1a32]/70 p-4 shadow-md backdrop-blur-sm transition-all">
      <div onClick={onSelect} className="cursor-pointer active:opacity-80">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-100 truncate">
              {marina.name}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
              {marina.harbour}, {marina.region}
            </p>
          </div>
          {distKm != null && (
            <span className="shrink-0 mt-0.5 rounded-full bg-sky-900/50 border border-sky-500/20 px-2 py-0.5 text-[9px] font-bold text-sky-400">
              {distKm < 1
                ? `${Math.round(distKm * 1000)} m`
                : `${distKm.toFixed(1)} km`}
            </span>
          )}
        </div>

        {marina.phone && (
          <p className="mt-2 text-xs text-zinc-400">
            <span className="text-zinc-500">Phone: </span>
            <span className="font-semibold text-emerald-400">
              {marina.phone}
            </span>
          </p>
        )}

        {marina.facilities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {marina.facilities.slice(0, 5).map(f => (
              <span
                key={f}
                className="rounded bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[9px] text-zinc-400 font-medium"
              >
                {f}
              </span>
            ))}
            {marina.facilities.length > 5 && (
              <span className="text-[9px] text-zinc-600">
                +{marina.facilities.length - 5} more
              </span>
            )}
          </div>
        )}

        <div className="mt-2.5 flex gap-3 text-[10px] text-zinc-500">
          {marina.depthM != null && (
            <span className="flex items-center gap-0.5">
              <Waves size={9} className="text-sky-500" />
              {marina.depthM} m depth
            </span>
          )}
          {marina.maxLengthM != null && (
            <span className="flex items-center gap-0.5">
              <Anchor size={9} className="text-indigo-400" />
              max {marina.maxLengthM} m
            </span>
          )}
          {marina.priceFromEur != null && (
            <span>€{marina.priceFromEur}/night</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2 border-t border-white/[0.05] pt-3">
        {marina.phone && (
          <a
            href={`tel:${marina.phone.replace(/\s/g, '')}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold active:scale-95 transition-transform"
          >
            <Phone size={12} />
            Call marina
          </a>
        )}
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/20 text-indigo-300 text-[11px] font-bold active:scale-95 transition-transform"
        >
          <CalendarDays size={12} />
          Book / Enquiry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Enquiry panel (pre-filled from search filters)
// ---------------------------------------------------------------
function EnquiryPanel({
  marina,
  enquiriesEmail,
  prefill,
  onBack,
}: {
  marina: MarinaListing;
  enquiriesEmail: string;
  prefill: SearchFilters;
  onBack: () => void;
}) {
  const minDate = todayIso();
  const [form, setForm] = useState<EnquiryForm>({
    arrival: prefill.arrival,
    departure: prefill.departure,
    lengthM: prefill.lengthM,
    note: '',
  });
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const set = (k: keyof EnquiryForm) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setSubmitState('busy');
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        marinaId: marina.id,
        arrival: form.arrival.trim() || minDate,
        departure: form.departure.trim(),
        note: form.note.trim(),
      };
      const len = form.lengthM.trim();
      if (len !== '') payload.boatLengthM = Number(len);

      const res = await fetch('/api/marinas/berth-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setSubmitState('error');
        setSubmitError(data.error ?? `Request failed (${res.status})`);
      } else {
        setSubmitState('ok');
      }
    } catch {
      setSubmitState('error');
      setSubmitError('Network error — try again.');
    }
  };

  const emailBody = encodeURIComponent(
    buildEnquiryBody(
      marina,
      form.arrival,
      form.departure,
      form.lengthM,
      form.note,
    ),
  );
  const emailHref = `mailto:${enquiriesEmail}?subject=${encodeURIComponent(
    `Berth enquiry – ${marina.name}`,
  )}&body=${emailBody}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 active:scale-90 transition-transform"
          aria-label="Back to search"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Enquiry &amp; pre-booking
          </p>
          <p className="text-sm font-bold text-slate-100 truncate">
            {marina.name}
          </p>
          <p className="text-[10px] text-zinc-500">
            {marina.harbour}, {marina.region}
          </p>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          {marina.phone && (
            <a
              href={`tel:${marina.phone.replace(/\s/g, '')}`}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 text-xs font-bold active:scale-95 transition-transform"
            >
              <Phone size={13} />
              Call marina
            </a>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${marina.lat},${marina.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600/15 border border-sky-500/20 text-sky-300 text-xs font-bold active:scale-95 transition-transform"
          >
            <MapPin size={13} />
            View on Map
          </a>
        </div>

        {/* Marina details collapsible */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300"
        >
          <span className="font-bold">Marina Details</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expanded && (
          <div className="rounded-xl bg-[#0c1a32]/60 border border-white/[0.06] p-3 space-y-2 text-xs text-zinc-400">
            {marina.description && (
              <p className="leading-relaxed">{marina.description}</p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {marina.depthM != null && (
                <div>
                  <span className="text-zinc-600">Depth:</span> {marina.depthM}{' '}
                  m
                </div>
              )}
              {marina.maxLengthM != null && (
                <div>
                  <span className="text-zinc-600">Max length:</span>{' '}
                  {marina.maxLengthM} m
                </div>
              )}
              {marina.priceFromEur != null && (
                <div>
                  <span className="text-zinc-600">From:</span> €
                  {marina.priceFromEur}/night
                </div>
              )}
            </div>
            {marina.facilities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {marina.facilities.map(f => (
                  <span
                    key={f}
                    className="rounded bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dates */}
        <div className="space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
            Dates
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="enquiry-arrival"
                className="text-[10px] font-bold text-zinc-500 block mb-1"
              >
                Arrival
              </label>
              <input
                id="enquiry-arrival"
                type="date"
                min={minDate}
                value={form.arrival}
                onChange={e => {
                  set('arrival')(e.target.value);
                  // Auto-suggest 2 nights if departure not set
                  if (!form.departure && e.target.value) {
                    set('departure')(addDaysIso(e.target.value, 2));
                  }
                }}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label
                htmlFor="enquiry-departure"
                className="text-[10px] font-bold text-zinc-500 block mb-1"
              >
                Departure
              </label>
              <input
                id="enquiry-departure"
                type="date"
                min={form.arrival || minDate}
                value={form.departure}
                onChange={e => set('departure')(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50"
              />
            </div>
          </div>
          {form.arrival && (
            <button
              type="button"
              onClick={() => set('departure')(addDaysIso(form.arrival, 2))}
              className="text-[10px] font-bold text-sky-400 hover:text-sky-300 active:scale-95 transition-transform"
            >
              Set 2-night stay from arrival
            </button>
          )}
        </div>

        {/* Boat length */}
        <div>
          <label
            htmlFor="enquiry-length"
            className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block mb-1"
          >
            Boat length (metres)
          </label>
          <input
            id="enquiry-length"
            type="number"
            min="3"
            max="100"
            step="0.1"
            value={form.lengthM}
            onChange={e => set('lengthM')(e.target.value)}
            placeholder="e.g. 12.5"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50"
          />
        </div>

        {/* Note */}
        <div>
          <label
            htmlFor="enquiry-note"
            className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block mb-1"
          >
            Note to marina
          </label>
          <textarea
            id="enquiry-note"
            rows={3}
            value={form.note}
            onChange={e => set('note')(e.target.value)}
            placeholder="Draft, beam, specific requirements…"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50 resize-none"
          />
        </div>

        {/* Submit */}
        {submitState === 'ok' ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-900/30 border border-emerald-500/20 px-4 py-3">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <p className="text-xs font-bold text-emerald-300">
              Enquiry saved! You can also email the marina directly.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={submitState === 'busy'}
              onClick={() => void handleSubmit()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitState === 'busy' ? (
                <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {submitState === 'busy' ? 'Saving…' : 'Save berth request'}
            </button>

            {enquiriesEmail && (
              <a
                href={emailHref}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm font-bold text-slate-300 active:scale-[0.98] transition-all"
              >
                <Send size={14} className="text-sky-400" />
                Email Marina Directly
              </a>
            )}

            {submitState === 'error' && (
              <p className="text-xs text-red-400 text-center">
                {submitError || 'Could not save. Please try again.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export function MobileMarinas() {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('United Kingdom');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [lengthM, setLengthM] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [listMarinas, setListMarinas] = useState<MarinaListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [radiusMi, setRadiusMi] = useState(10);
  const [selected, setSelected] = useState<MarinaListing | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [listPage, setListPage] = useState(0);

  // Reset pagination on filter change
  useEffect(() => {
    setListPage(0);
  }, [
    search,
    country,
    arrival,
    departure,
    lengthM,
    userPos?.lat,
    userPos?.lng,
    radiusMi,
  ]);

  const enquiriesEmail = (
    process.env.NEXT_PUBLIC_MARINA_ENQUIRIES_EMAIL ?? ''
  ).trim();
  const minDate = todayIso();

  // Load countries from the API
  useEffect(() => {
    void fetch('/api/marinas/countries', { credentials: 'same-origin' })
      .then(r => r.json() as Promise<{ countries?: string[] }>)
      .then(d => {
        if (d && Array.isArray(d.countries)) setCountries(d.countries);
      })
      .catch(() => {
        /* keep empty; select still works */
      });
  }, []);

  useEffect(() => {
    if (countries.length === 0) return;
    setCountry(prev => {
      if (prev === '' || countries.includes(prev)) return prev;
      return countries.includes('United Kingdom') ? 'United Kingdom' : '';
    });
  }, [countries]);

  // Fetch marinas based on filters
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (country) params.set('country', country);
      const qt = search.trim();
      if (qt) params.set('q', qt);
      const len = lengthM.trim();
      if (len !== '') params.set('boatLengthM', len);
      if (userPos) {
        params.set('lat', String(userPos.lat));
        params.set('lng', String(userPos.lng));
        params.set('radiusMi', String(radiusMi));
      }
      params.set('limit', String(LIST_FETCH_LIMIT));
      void fetch(`/api/marinas/list?${params.toString()}`, {
        signal: ac.signal,
        credentials: 'same-origin',
      })
        .then(r => r.json() as Promise<{ marinas?: MarinaListing[] }>)
        .then(d => {
          if (ac.signal.aborted) return;
          setListMarinas(Array.isArray(d.marinas) ? d.marinas : []);
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setListMarinas([]);
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [country, search, lengthM, userPos, radiusMi]);

  // Near me
  const getNearMe = useCallback(async () => {
    setGeoLoading(true);
    setGeoError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        // Native Android / iOS
        const permission = await Geolocation.requestPermissions();
        console.log('Is Native:', Capacitor.isNativePlatform());
        if (
          permission.location !== 'granted' &&
          permission.coarseLocation !== 'granted'
        ) {
          throw new Error('Location permission denied.');
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 30000,
        });

        setUserPos({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      } else {
        // Browser
        navigator.geolocation.getCurrentPosition(
          position => {
            setUserPos({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });

            setGeoLoading(false);
          },
          error => {
            setGeoLoading(false);
            setGeoError(error.message);
          },
          {
            enableHighAccuracy: true,
          },
        );

        return;
      }
    } catch (err) {
      console.error(err);

      setGeoError(
        err instanceof Error ? err.message : 'Unable to get your location.',
      );
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setCountry('United Kingdom');
    setArrival('');
    setDeparture('');
    setLengthM('');
    setUserPos(null);
    setGeoError(null);
    setRadiusMi(10);
  };

  const hasActiveFilters =
    search ||
    country !== 'United Kingdom' ||
    arrival ||
    departure ||
    lengthM ||
    userPos;

  const LIST_PAGE_SIZE = 10;
  const listPageCount = Math.max(
    1,
    Math.ceil(listMarinas.length / LIST_PAGE_SIZE),
  );
  const safeListPage = Math.min(listPage, listPageCount - 1);
  const visibleMarinas = listMarinas.slice(
    safeListPage * LIST_PAGE_SIZE,
    safeListPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE,
  );
  const rangeFrom =
    listMarinas.length === 0 ? 0 : safeListPage * LIST_PAGE_SIZE + 1;
  const rangeTo = Math.min(
    (safeListPage + 1) * LIST_PAGE_SIZE,
    listMarinas.length,
  );
  const canPrevPage = safeListPage > 0;
  const canNextPage = safeListPage < listPageCount - 1;

  // Enquiry panel
  if (selected) {
    return (
      <div className="fixed inset-0 bg-[#071b36] text-white flex flex-col overflow-hidden">
        <EnquiryPanel
          marina={selected}
          enquiriesEmail={enquiriesEmail}
          prefill={{ arrival, departure, lengthM }}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#071b36] text-white flex flex-col overflow-hidden">
      {/* ── HEADER ── */}
      <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 bg-[#071b36] border-b border-white/[0.05]">
        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/20">
              <Anchor size={15} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-100 leading-none">
                Marina berths
              </h1>
              <p className="text-[10px] text-zinc-500">
                Filter by country, text search, or use my location to locate
                nearby marinas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors active:scale-95 ${
              filtersOpen || hasActiveFilters
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                : 'bg-white/[0.03] border-white/[0.07] text-zinc-400'
            }`}
          >
            <SlidersHorizontal size={12} />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[8px] font-extrabold text-white">
                ✓
              </span>
            )}
          </button>
        </div>

        {/* Search bar (always visible) */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            id="marina-search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Place or marina name…"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pl-8 pr-3 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/40"
          />
        </div>

        {/* ── EXPANDED FILTERS PANEL ── */}
        {filtersOpen && (
          <div className="mt-3 space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
            {/* Country + Near me */}
            <div className="flex gap-2">
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500/40 appearance-none"
              >
                <option value="">All countries</option>
                {countries.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={getNearMe}
                disabled={geoLoading}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50 ${
                  userPos
                    ? 'bg-sky-600/20 border-sky-500/30 text-sky-300'
                    : 'bg-sky-900/20 border-sky-500/25 text-sky-400'
                }`}
              >
                {geoLoading ? (
                  <div className="size-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                ) : (
                  <Navigation size={11} />
                )}
                {userPos ? 'Near me ✓' : 'Near me'}
              </button>
            </div>

            {geoError && (
              <p className="text-[10px] text-red-400 mt-1">{geoError}</p>
            )}

            {userPos && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-xs">
                <span className="text-zinc-400">Search radius:</span>
                <select
                  value={radiusMi}
                  onChange={e => setRadiusMi(Number(e.target.value))}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500/40 appearance-none"
                >
                  <option value={10}>10 mi</option>
                  <option value={25}>25 mi</option>
                  <option value={50}>50 mi</option>
                  <option value={100}>100 mi</option>
                  <option value={250}>250 mi</option>
                  <option value={500}>500 mi</option>
                  <option value={1500}>1,500 mi</option>
                  <option value={9999}>Worldwide (sort only)</option>
                </select>
              </div>
            )}

            {/* Arrival / Departure */}
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                <CalendarDays size={10} /> Dates
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="filter-arrival"
                    className="text-[9px] text-zinc-600 block mb-1"
                  >
                    Arrival
                  </label>
                  <input
                    id="filter-arrival"
                    type="date"
                    min={minDate}
                    value={arrival}
                    onChange={e => {
                      setArrival(e.target.value);
                      // Auto-fill departure if empty
                      if (!departure && e.target.value) {
                        setDeparture(addDaysIso(e.target.value, 2));
                      }
                    }}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="filter-departure"
                    className="text-[9px] text-zinc-600 block mb-1"
                  >
                    Departure
                  </label>
                  <input
                    id="filter-departure"
                    type="date"
                    min={arrival || minDate}
                    value={departure}
                    onChange={e => setDeparture(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              {/* 2-night shortcut */}
              {arrival && (
                <button
                  type="button"
                  onClick={() => setDeparture(addDaysIso(arrival, 2))}
                  className="mt-1.5 text-[10px] font-bold text-sky-400 hover:text-sky-300 active:scale-95 transition-transform"
                >
                  Set 2-night stay from arrival
                </button>
              )}
            </div>

            {/* Boat length */}
            <div>
              <label
                htmlFor="filter-length"
                className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block mb-1"
              >
                Boat length (metres)
              </label>
              <input
                id="filter-length"
                type="number"
                min="3"
                max="100"
                step="0.1"
                value={lengthM}
                onChange={e => setLengthM(e.target.value)}
                placeholder="e.g. 12.5"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-slate-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50"
              />
              {lengthM && (
                <p className="text-[9px] text-zinc-600 mt-1">
                  Tip: set arrival, then we suggest a departure two nights
                  ahead.
                </p>
              )}
            </div>

            {/* Clear filters */}
            <button
              type="button"
              onClick={clearFilters}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] py-2 text-[11px] font-bold text-zinc-400 active:scale-[0.98] transition-transform"
            >
              <X size={11} />
              Clear filters
            </button>
          </div>
        )}

        {/* Active filter pills (collapsed view) */}
        {!filtersOpen && hasActiveFilters && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {country && country !== 'United Kingdom' && (
              <span className="rounded-full bg-indigo-900/40 border border-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-300">
                {country}
              </span>
            )}
            {country === 'United Kingdom' && (
              <span className="rounded-full bg-indigo-900/40 border border-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-300">
                UK
              </span>
            )}
            {arrival && (
              <span className="rounded-full bg-sky-900/40 border border-sky-500/20 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                {arrival}
                {departure ? ` → ${departure}` : ''}
              </span>
            )}
            {lengthM && (
              <span className="rounded-full bg-teal-900/40 border border-teal-500/20 px-2 py-0.5 text-[9px] font-bold text-teal-300">
                {lengthM} m
              </span>
            )}
            {userPos && (
              <span className="rounded-full bg-emerald-900/40 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                📍 Near me
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── LIST ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="size-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-xs text-zinc-500">Loading marinas…</p>
          </div>
        ) : listMarinas.length === 0 ? (
          <div className="py-12 text-center">
            <Anchor size={28} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-zinc-400">No marinas found</p>
            <p className="text-xs text-zinc-600 mt-1">
              Try a different country or search term
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-xs font-bold text-sky-400 underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-zinc-600 font-bold px-0.5">
              Showing {rangeFrom}–{rangeTo} of {listMarinas.length} marina
              {listMarinas.length === 1 ? '' : 's'}
              {userPos ? ' · sorted by distance' : ''}
              {arrival ? ` · from ${arrival}` : ''}
            </p>
            {visibleMarinas.map(m => {
              const distKm = userPos
                ? distanceKm(userPos.lat, userPos.lng, m.lat, m.lng)
                : null;
              return (
                <MarinaCard
                  key={m.id}
                  marina={m}
                  distKm={distKm}
                  onSelect={() => setSelected(m)}
                />
              );
            })}
            {listMarinas.length > LIST_PAGE_SIZE && (
              <div className="mt-4 flex flex-wrap items-center gap-2 px-0.5 pb-4">
                <button
                  type="button"
                  disabled={!canPrevPage}
                  onClick={() => setListPage(p => Math.max(0, p - 1))}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-bold text-zinc-300 active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all"
                >
                  Previous 10
                </button>
                <button
                  type="button"
                  disabled={!canNextPage}
                  onClick={() =>
                    setListPage(p => Math.min(listPageCount - 1, p + 1))
                  }
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-bold text-zinc-300 active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all"
                >
                  Show next 10
                </button>
                <span className="text-[11px] text-zinc-500 font-medium ml-1">
                  Page {safeListPage + 1} of {listPageCount}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
