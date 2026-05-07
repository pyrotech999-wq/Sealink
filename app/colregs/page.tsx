import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "COLREGs",
  description:
    "Key COLREGs principles: responsibility, safe speed, give-way and stand-on actions, head-on, crossing, and overtaking.",
};

const RNLI_COLREGS_PDF_URL =
  "https://rnli.org/-/media/rnli/downloads/maritime-sar-2017.pdf?rev=ae476fa675de486cbd40819b8515b144";

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

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
          Key COLREGs Principles
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-300">
          <li>
            <strong className="text-zinc-100">Responsibility:</strong> Every vessel must use all available means (radar,
            eyes, ears) to assess risk.
          </li>
          <li>
            <strong className="text-zinc-100">Safe Speed (Rule 6):</strong> Vessels must proceed at a speed allowing
            proper action to avoid collision, considering visibility, traffic, and manoeuvrability.
          </li>
          <li>
            <strong className="text-zinc-100">Give-Way Vessel:</strong> Must take early and substantial action to keep
            clear, avoiding crossing ahead if possible.
          </li>
          <li>
            <strong className="text-zinc-100">Stand-On Vessel:</strong> Must maintain course and speed, but should take
            action if the give-way vessel fails to act.
          </li>
          <li>
            <strong className="text-zinc-100">Head-on:</strong> Both vessels alter course to starboard and pass
            port-to-port.
          </li>
          <li>
            <strong className="text-zinc-100">Crossing:</strong> Vessel with the other on its starboard side must give way.
          </li>
          <li>
            <strong className="text-zinc-100">Overtaking:</strong> Any vessel overtaking another must keep out of the way
            of the vessel being overtaken.
          </li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-zinc-50">
          Full regulations (PDF)
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          <a
            href={RNLI_COLREGS_PDF_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-400 hover:underline"
          >
            COLREG&apos;S pdf
          </a>{" "}
          — these are PDF pages of the rules supplied by RNLI for reading or printing.
        </p>
      </section>
    </div>
  );
}

