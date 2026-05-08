import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "COLREGs",
  description:
    "Key COLREGs principles: responsibility, safe speed, give-way and stand-on actions, head-on, crossing, and overtaking.",
};

const COLREGS_FULL_PDF_URL =
  "https://www.dohle-yachts.com/wp-content/uploads/2022/07/COLREGS-The-Rules-of-the-Road.pdf";

const USCG_USA_NAVIGATION_RULES_PDF_URL =
  "https://www.navcen.uscg.gov/sites/default/files/pdf/navRules/navrules.pdf";

const RNLI_MARITIME_SAR_MANUAL_URL =
  "https://rnli.org/-/media/rnli/downloads/maritime-sar-2017.pdf?rev=ae476fa675de486cbd40819b8515b144";

const COLREGS_QUIZLET_FLASHCARDS_URL =
  "https://quizlet.com/727929923/flashcards?funnelUUID=987482af-88df-4b70-9d78-dc784b4ddb01";

export default function ColregsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-32 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-400">
        <Link href="/" className="hover:underline">
          ← Home
        </Link>
        <Link href="/navigation-charts" className="hover:underline">
          Navigation charts
        </Link>
        <Link href="/weather" className="hover:underline">
          Weather &amp; sea
        </Link>
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>

      <header className="mt-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl">
          COLREGs
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          The International Regulations for Preventing Collisions at Sea.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-50">
          Full regulations (PDF)
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <a
            href={USCG_USA_NAVIGATION_RULES_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            USA Navigation rules
          </a>
          <a
            href={COLREGS_FULL_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            COLREGS — The Rules of the Road (PDF)
          </a>
          <a
            href={RNLI_MARITIME_SAR_MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            Maritime SAR manual
          </a>
          <a
            href={COLREGS_QUIZLET_FLASHCARDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700"
          >
            Flash Cards
          </a>
        </div>
      </section>
    </div>
  );
}

