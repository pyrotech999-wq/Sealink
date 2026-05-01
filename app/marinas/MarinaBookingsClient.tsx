"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MARINA_WORLD_CATALOG, marinaTelHref, type MarinaListing } from "@/lib/marina-catalog";
import { distanceKm, distanceMiles } from "@/lib/geo-haversine";

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildEnquiryBody(m: MarinaListing, arrival: string, departure: string, lengthM: string, note: string): string {
  const lines = [
    `Marina enquiry via SeaLink`,
    ``,
    `Marina: ${m.name}`,
    `Location: ${m.harbour}, ${m.region}, ${m.country}`,
    `Marina phone: ${m.phone || "(not listed)"}`,
    ``,
    `Requested arrival: ${arrival || "(not set)"}`,
    `Requested departure: ${departure || "(not set)"}`,
    `Boat length (m): ${lengthM || "(not set)"}`,
    ``,
    note.trim() ? `Notes:\n${note.trim()}` : `Notes: (none)`,
    ``,
    `— Sent from SeaLink marina bookings.`,
  ];
  return lines.join("\n");
}

type SavedBerthRequest = {
  id: string;
  marinaId: string;
  marinaName: string;
  marinaPhone: string;
  arrival: string;
  departure: string;
  boatLengthM: number | null;
  note: string;
  status: string;
  createdAt: string;
};

export function MarinaBookingsClient() {
  const [locationQ, setLocationQ] = useState("");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<MarinaListing | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const [countryFilter, setCountryFilter] = useState("");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  /** Max distance from user when “Near me” is active (statute miles). Large value = no practical limit but still sorted. */
  const [radiusMi, setRadiusMi] = useState(250);

  const [signedIn, setSignedIn] = useState(false);
  const [meChecked, setMeChecked] = useState(false);
  const [savedRequests, setSavedRequests] = useState<SavedBerthRequest[]>([]);
  /** From `/api/marinas/config` — server has both URL + service role (not inferred from berth-requests fetch errors). */
  const [supabaseReady, setSupabaseReady] = useState<boolean | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedBerthRequest | null>(null);

  const enquiriesEmail = (process.env.NEXT_PUBLIC_MARINA_ENQUIRIES_EMAIL ?? "").trim();

  const minDate = todayIso();

  const refreshRequests = useCallback(async () => {
    try {
      const r = await fetch("/api/marinas/berth-requests", { credentials: "same-origin" });
      const data = (await r.json()) as { requests?: SavedBerthRequest[]; error?: string };
      if (r.ok && Array.isArray(data.requests)) setSavedRequests(data.requests);
    } catch {
      /* keep existing list */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/marinas/config")
      .then((res) => res.json() as Promise<{ supabaseConfigured?: boolean }>)
      .then((d) => {
        if (!cancelled && typeof d.supabaseConfigured === "boolean") setSupabaseReady(d.supabaseConfigured);
      })
      .catch(() => {
        /* leave supabaseReady null */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/me", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ signedIn?: boolean }>)
      .then((d) => {
        if (!cancelled) {
          setSignedIn(d?.signedIn === true);
          setMeChecked(true);
          if (d?.signedIn) void refreshRequests();
        }
      })
      .catch(() => {
        if (!cancelled) setMeChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshRequests]);

  const [countries, setCountries] = useState<string[]>([]);
  const [listMarinas, setListMarinas] = useState<MarinaListing[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listSource, setListSource] = useState<"supabase" | "seed" | null>(null);

  useEffect(() => {
    void fetch("/api/marinas/countries", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ countries?: string[] }>)
      .then((d) => {
        if (Array.isArray(d.countries)) setCountries(d.countries);
      })
      .catch(() => {
        /* keep empty; select still works */
      });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setListLoading(true);
      const params = new URLSearchParams();
      if (countryFilter) params.set("country", countryFilter);
      const qt = locationQ.trim();
      if (qt) params.set("q", qt);
      const len = lengthM.trim();
      if (len !== "") params.set("boatLengthM", len);
      if (userPos) {
        params.set("lat", String(userPos.lat));
        params.set("lng", String(userPos.lng));
        params.set("radiusMi", String(radiusMi));
      }
      params.set("limit", "250");
      void fetch(`/api/marinas/list?${params.toString()}`, {
        signal: ac.signal,
        credentials: "same-origin",
      })
        .then((r) => r.json() as Promise<{ marinas?: MarinaListing[]; source?: string }>)
        .then((d) => {
          if (ac.signal.aborted) return;
          setListMarinas(Array.isArray(d.marinas) ? d.marinas : []);
          setListSource(d.source === "supabase" ? "supabase" : "seed");
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setListMarinas([]);
            setListSource(null);
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) setListLoading(false);
        });
    }, 300);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [countryFilter, locationQ, lengthM, userPos, radiusMi]);

  function requestNearMe() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(err.message || "Could not read your location (check permissions).");
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 20_000 },
    );
  }

  async function copyEnquiry(m: MarinaListing) {
    setCopyHint(null);
    const body = buildEnquiryBody(m, arrival, departure, lengthM, note);
    try {
      await navigator.clipboard.writeText(body);
      setCopyHint("Enquiry copied — paste into email or your marina app.");
    } catch {
      setCopyHint("Could not copy automatically. Select the text in the box below.");
    }
  }

  async function submitBerthRequest() {
    if (!selected) return;
    setSubmitError(null);
    setLastSaved(null);
    setSubmitLoading(true);
    try {
      const payload: Record<string, unknown> = {
        marinaId: selected.id,
        arrival: arrival.trim() || minDate,
        departure: departure.trim(),
        note: note.trim(),
      };
      const len = lengthM.trim();
      if (len !== "") payload.boatLengthM = Number(len);

      const r = await fetch("/api/marinas/berth-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as { ok?: boolean; request?: SavedBerthRequest; error?: string };
      if (!r.ok) {
        setSubmitError(data.error ?? `Request failed (${r.status})`);
        return;
      }
      if (data.request) {
        setLastSaved(data.request);
        await refreshRequests();
      }
    } catch {
      setSubmitError("Network error — try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  const enquiryForSelected = selected
    ? buildEnquiryBody(selected, arrival, departure, lengthM, note)
    : "";

  const canSubmit =
    signedIn &&
    selected &&
    Boolean(arrival.trim()) &&
    Boolean(departure.trim()) &&
    arrival < departure;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-2">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          ← Home
        </Link>
      </div>

      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Marina berths</h1>
        <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Filter by <strong className="font-medium text-zinc-800 dark:text-zinc-200">country</strong>, text search, boat length, or{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">near me</strong>. With{" "}
          <code className="rounded bg-zinc-200/80 px-1 text-sm dark:bg-zinc-800">005_marinas</code> +{" "}
          <code className="rounded bg-zinc-200/80 px-1 text-sm dark:bg-zinc-800">npm run marinas:import:osm</code>, results come from your
          OpenStreetMap import; otherwise a curated seed list loads. Save berth requests when signed in (Supabase).
        </p>
      </header>

      {meChecked && !signedIn ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to save berth requests to your account. You can still copy enquiries and call marinas without an account.
        </p>
      ) : null}

      {signedIn && supabaseReady === false ? (
        <p className="mt-6 rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <strong>This deployment</strong> doesn’t have Supabase credentials, so berth requests won’t be saved. Use{" "}
          <strong>Copy enquiry</strong> and call the marina, or configure the server:
        </p>
      ) : null}
      {signedIn && supabaseReady === false ? (
        <ul className="mt-2 list-inside list-disc rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          <li>
            Set <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">SUPABASE_SERVICE_ROLE_KEY</code> (Settings → API
            → Project URL + <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">service_role</code> secret — not
            the anon key).
          </li>
          <li>
            On <strong>Vercel / your host</strong>, add the same variables for Production (and Preview if needed), then{" "}
            <strong>redeploy</strong> — <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">.env.local</code> only
            applies on your laptop.
          </li>
          <li>
            In Supabase SQL Editor, run{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">004_marina_berth_requests.sql</code> (and earlier
            migrations if you haven’t).
          </li>
        </ul>
      ) : null}

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Search</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Country</span>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Place or marina</span>
            <input
              type="search"
              value={locationQ}
              onChange={(e) => setLocationQ(e.target.value)}
              placeholder="e.g. La Rochelle, Cornwall, Phuket…"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-600/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <div className="sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Near me</span>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => void requestNearMe()}
                disabled={geoLoading}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 dark:hover:bg-emerald-500"
              >
                {geoLoading ? "Locating…" : userPos ? "Update my location" : "Use my location"}
              </button>
              {userPos ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">Within</span>
                    <select
                      value={radiusMi}
                      onChange={(e) => setRadiusMi(Number(e.target.value))}
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value={100}>100 mi</option>
                      <option value={250}>250 mi</option>
                      <option value={500}>500 mi</option>
                      <option value={1500}>1 500 mi</option>
                      <option value={9999}>Worldwide (sort only)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUserPos(null);
                      setGeoError(null);
                    }}
                    className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                  >
                    Clear location
                  </button>
                </>
              ) : null}
            </div>
            {geoError ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{geoError}</p> : null}
            {userPos ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Sorted by distance from your position. Marinas outside the radius are hidden unless you choose “Worldwide
                (sort only)”.
              </p>
            ) : null}
          </div>
          <label className="block">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Arrival</span>
            <input
              type="date"
              min={minDate}
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Departure</span>
            <input
              type="date"
              min={arrival || minDate}
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Boat length (metres)</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step={0.1}
              value={lengthM}
              onChange={(e) => setLengthM(e.target.value)}
              placeholder="e.g. 12.5"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Tip: set arrival, then we suggest a departure two nights ahead.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const a = arrival || minDate;
              setArrival(a);
              setDeparture(addDaysIso(a, 2));
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Set 2-night stay from arrival
          </button>
          <button
            type="button"
            onClick={() => {
              setLocationQ("");
              setCountryFilter("");
              setUserPos(null);
              setGeoError(null);
              setRadiusMi(250);
              setArrival("");
              setDeparture("");
              setLengthM("");
              setNote("");
              setSelected(null);
              setCopyHint(null);
              setSubmitError(null);
              setLastSaved(null);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {listLoading ? "Loading marinas…" : `${listMarinas.length} marina${listMarinas.length === 1 ? "" : "s"}`}
          </h2>
          {listSource === "supabase" ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              OSM directory
            </span>
          ) : listSource === "seed" ? (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Seed list
            </span>
          ) : null}
        </div>
        <ul className="mt-4 flex flex-col gap-4">
          {listMarinas.map((m) => {
            const tel = marinaTelHref(m.phone);
            const distKm =
              userPos != null ? Math.round(distanceKm(userPos.lat, userPos.lng, m.lat, m.lng)) : null;
            return (
              <li key={m.id}>
                <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{m.name}</h3>
                      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                        {m.harbour} · {m.region}, {m.country}
                      </p>
                      {distKm != null ? (
                        <p className="mt-1 text-xs font-medium text-emerald-800 dark:text-emerald-400">
                          ~{distKm} km from your position
                        </p>
                      ) : null}
                      {m.phone ? (
                        <p className="mt-2 text-sm">
                          <span className="text-zinc-500 dark:text-zinc-400">Marina phone: </span>
                          {tel ? (
                            <a
                              href={tel}
                              className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-400"
                            >
                              {m.phone}
                            </a>
                          ) : (
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">{m.phone}</span>
                          )}
                        </p>
                      ) : null}
                      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{m.description}</p>
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {m.facilities.map((f) => (
                          <li
                            key={f}
                            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Max length {m.maxLengthM != null ? `${m.maxLengthM} m` : "—"} · Chart depth{" "}
                        {m.depthM != null ? `~${m.depthM} m` : "—"} ·{" "}
                        {m.priceFromEur != null ? `From €${m.priceFromEur}/night` : "Price on request"} (indicative)
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      {tel ? (
                        <a
                          href={tel}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-600/40 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950"
                        >
                          Call marina
                        </a>
                      ) : null}
                      <a
                        href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Map
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setCopyHint(null);
                          setSubmitError(null);
                          setLastSaved(null);
                          void copyEnquiry(m);
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-500"
                      >
                        Draft enquiry
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
        {!listLoading && listMarinas.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            No marinas match — try another country or search, relax boat length, or increase the “Near me” radius /
            choose Worldwide (sort only).
          </p>
        ) : null}
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Enquiry &amp; pre-booking</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Add a note, then copy or email. To <strong className="text-zinc-700 dark:text-zinc-300">store a request</strong>, choose a marina
          below, set arrival before departure, and sign in. You’ll still need to <strong className="text-zinc-700 dark:text-zinc-300">call the marina</strong>{" "}
          (number on the card) to confirm — demo listings use illustrative numbers; replace with real data in production.
        </p>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Note to marina</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Mooring preference, draft, pets on board…"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        {selected ? (
          <>
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              Selected: <strong className="text-zinc-800 dark:text-zinc-200">{selected.name}</strong>
              {selected.phone ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={marinaTelHref(selected.phone)} className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-400">
                    {selected.phone}
                  </a>
                </>
              ) : null}
            </p>

            {lastSaved && lastSaved.marinaId === selected.id ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-semibold">Request saved (status: {lastSaved.status}).</p>
                <p className="mt-1">
                  Reference <span className="font-mono text-xs">{lastSaved.id.slice(0, 8)}…</span> — call{" "}
                  {lastSaved.marinaPhone && marinaTelHref(lastSaved.marinaPhone) ? (
                    <a href={marinaTelHref(lastSaved.marinaPhone)} className="font-semibold underline-offset-2 hover:underline">
                      {lastSaved.marinaPhone}
                    </a>
                  ) : (
                    "the marina"
                  )}{" "}
                  to confirm your berth.
                </p>
              </div>
            ) : null}

            {submitError ? (
              <p className="mt-3 text-sm text-red-700 dark:text-red-400">{submitError}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canSubmit || submitLoading || supabaseReady === false}
                onClick={() => void submitBerthRequest()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {submitLoading ? "Saving…" : "Save berth request"}
              </button>
              <button
                type="button"
                onClick={() => void copyEnquiry(selected)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Copy enquiry
              </button>
              {enquiriesEmail ? (
                <a
                  href={`mailto:${encodeURIComponent(enquiriesEmail)}?subject=${encodeURIComponent(`Berth enquiry: ${selected.name}`)}&body=${encodeURIComponent(enquiryForSelected)}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Open email
                </a>
              ) : null}
            </div>
            {!canSubmit && signedIn ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Set <strong>arrival</strong> and <strong>departure</strong> (departure after arrival) to enable saving.
              </p>
            ) : null}

            <textarea
              readOnly
              value={enquiryForSelected}
              rows={10}
              className="mt-4 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
            {copyHint ? <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-400">{copyHint}</p> : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Choose “Draft enquiry” on a marina to fill this block.</p>
        )}
      </section>

      {signedIn && savedRequests.length > 0 ? (
        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Your saved requests</h2>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {savedRequests.map((req) => (
              <li key={req.id} className="py-3 first:pt-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{req.marinaName}</p>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {req.arrival} → {req.departure} · {req.status}
                </p>
                {req.marinaPhone ? (
                  <a
                    href={marinaTelHref(req.marinaPhone)}
                    className="mt-1 inline-block text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-400"
                  >
                    {req.marinaPhone}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 pb-4 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
        Seed fallback: {MARINA_WORLD_CATALOG.length} harbours in{" "}
        <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">data/marinas-world.json</code> (
        <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">npm run marinas:build-catalog</code>). Expand with
        OSM: <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">005_marinas.sql</code> +{" "}
        <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">npm run marinas:import:osm</code>. Always confirm with
        each marina.
      </p>
    </div>
  );
}
