"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MARINA_DEMO_CATALOG, type MarinaListing } from "@/lib/marina-demo-catalog";

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
    ``,
    `Requested arrival: ${arrival || "(not set)"}`,
    `Requested departure: ${departure || "(not set)"}`,
    `Boat length (m): ${lengthM || "(not set)"}`,
    ``,
    note.trim() ? `Notes:\n${note.trim()}` : `Notes: (none)`,
    ``,
    `— Sent from SeaLink marina bookings (demo listings).`,
  ];
  return lines.join("\n");
}

export function MarinaBookingsClient() {
  const [locationQ, setLocationQ] = useState("");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<MarinaListing | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const enquiriesEmail = (process.env.NEXT_PUBLIC_MARINA_ENQUIRIES_EMAIL ?? "").trim();

  const minDate = todayIso();

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

  const enquiryForSelected = selected
    ? buildEnquiryBody(selected, arrival, departure, lengthM, note)
    : "";

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
          Browse demo harbours in the style of Navily: filter by place and boat length, set dates, then copy an enquiry
          or open your mail app. Real-time availability and payments will plug in here next.
        </p>
      </header>

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
          {filtered.map((m) => (
            <li key={m.id}>
              <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{m.name}</h3>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {m.harbour} · {m.region}, {m.country}
                    </p>
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
          ))}
        </ul>
        {filtered.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">No marinas match — try a broader place or length.</p>
        ) : null}
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Enquiry text</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Add a note for the harbour master, then copy or email.{" "}
          {enquiriesEmail ? (
            <>
              Messages can go to <span className="font-mono text-zinc-700 dark:text-zinc-300">{enquiriesEmail}</span> if
              you use “Open email”.
            </>
          ) : (
            <>
              Set <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NEXT_PUBLIC_MARINA_ENQUIRIES_EMAIL</code> in
              your env to enable one-tap mail.
            </>
          )}
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
              Draft for <strong className="text-zinc-800 dark:text-zinc-200">{selected.name}</strong>
            </p>
            <textarea
              readOnly
              value={enquiryForSelected}
              rows={12}
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyEnquiry(selected)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
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
          </>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Choose “Draft enquiry” on a marina to fill this block.</p>
        )}
        {copyHint ? <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-400">{copyHint}</p> : null}
      </section>

      <p className="mt-10 pb-4 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
        Demo listings for product design — not live availability.
      </p>
    </div>
  );
}
