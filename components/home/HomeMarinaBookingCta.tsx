import Link from "next/link";

type Props = {
  className?: string;
};

export function HomeMarinaBookingCta({ className }: Props) {
  return (
    <section className={className} aria-labelledby="marina-cta-heading">
      <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50/90 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-teal-950/30">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-7">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
              Marina berths
            </p>
            <h2 id="marina-cta-heading" className="mt-1 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Book a berth at a Marina
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Browse harbours worldwide by country, text search, or your current location, then draft an enquiry or save a
              request. Partner checkout is on the roadmap.
            </p>
          </div>
          <Link
            href="/marinas"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-emerald-500"
          >
            Find marina berths
          </Link>
        </div>
      </div>
    </section>
  );
}
