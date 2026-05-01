"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MARINA_DEMO_CATALOG, marinaTelHref, type MarinaListing } from "@/lib/marina-demo-catalog";

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

  const [signedIn, setSignedIn] = useState(false);
  const [meChecked, setMeChecked] = useState(false);
  const [savedRequests, setSavedRequests] = useState<SavedBerthRequest[]>([]);
  const [persistence, setPersistence] = useState<boolean | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedBerthRequest | null>(null);

  const enquiriesEmail = (process.env.NEXT_PUBLIC_MARINA_ENQUIRIES_EMAIL ?? "").trim();

  const minDate = todayIso();

  const refreshRequests = useCallback(async () => {
    try {
      const r = await fetch("/api/marinas/berth-requests", { credentials: "same-origin" });
      const data = (await r.json()) as { requests?: SavedBerthRequest[]; persistence?: boolean; error?: string };
      if (data.requests) setSavedRequests(data.requests);
      if (typeof data.persistence === "boolean") setPersistence(data.persistence);
    } catch {
      setPersistence(false);
    }
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

  const filtered = useMemo(() => {
    const q = locationQ.trim().toLowerCase();
    const len = lengthM.trim() === "" ? null : Number(lengthM);
    const lenOk = len !== null && !Number.isNaN(len) && len > 0;

    return MARINA_DEMO_CATALOG.filter((m) => {
      if (q) {
        const blob = `${m.name} ${m.harbour} ${m.region} ${m.country}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (lenOk && len! > m.maxLengthM) return false;
      return true;
    });
  }, [locationQ, lengthM]);

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
        setPersistence(true);
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
          Search harbours, set dates, then <strong className="font-medium text-zinc-800 dark:text-zinc-200">save a berth request</strong>{" "}
          (signed-in users, Supabase required) or copy an enquiry. Each listing includes a{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">marina phone number</strong> so you can call to
          confirm — a saved request is <strong className="font-medium text-zinc-800 dark:text-zinc-200">not</strong> a
          confirmed booking until the harbour agrees.
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

      {persistence === false && signedIn ? (
        <p className="mt-6 rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          Supabase isn’t configured on this server — requests won’t be stored. Use <strong>Copy enquiry</strong> and call
          the marina, or set{" "}
          <code className="rounded bg-white px-1 dark:bg-zinc-950">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-white px-1 dark:bg-zinc-950">SUPABASE_SERVICE_ROLE_KEY</code> and run migration{" "}
          <code className="rounded bg-white px-1 dark:bg-zinc-950">004_marina_berth_requests.sql</code>.
        </p>
      ) : null}

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Search</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Place or marina</span>
            <input
              type="search"
              value={locationQ}
              onChange={(e) => setLocationQ(e.target.value)}
              placeholder="e.g. La Rochelle, Cornwall, Portugal…"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-600/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {filtered.length} marina{filtered.length === 1 ? "" : "s"}
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
          {filtered.map((m) => {
            const tel = marinaTelHref(m.phone);
            return (
              <li key={m.id}>
                <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{m.name}</h3>
                      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                        {m.harbour} · {m.region}, {m.country}
                      </p>
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
                        Max length {m.maxLengthM} m · Chart depth ~{m.depthM} m · From €{m.priceFromEur}/night (indicative)
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
        {filtered.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">No marinas match — try a broader place or length.</p>
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
                disabled={!canSubmit || submitLoading || persistence === false}
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
        Listings are demos for product design — confirm all details and pricing with the marina.
      </p>
    </div>
  );
}
