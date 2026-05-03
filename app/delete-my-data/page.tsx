import type { Metadata } from "next";
import Link from "next/link";
import { OPERATOR_PUBLIC_EMAIL } from "@/lib/operator-public-email";

/** Fully static HTML for store / Meta data-deletion URL requirements. */
export const dynamic = "force-static";

const LIVE_PAGE = "https://sealinkapp.com/delete-my-data";

export const metadata: Metadata = {
  title: "Delete my data",
  description:
    "Instructions for deleting your SeaLink account and personal data. Email the operator or use the in-app deletion page. No sign-in required to read this page.",
  alternates: { canonical: "/delete-my-data" },
  robots: { index: true, follow: true },
};

const mailSubject = encodeURIComponent("SeaLink — please delete my account and data");
const mailBody = encodeURIComponent(
  [
    "Please delete my SeaLink account and the personal data you hold for my user id.",
    "",
    "Email I use with SeaLink (required):",
    "",
    "Any other details (optional):",
    "",
    "Thank you.",
  ].join("\n"),
);
const mailtoAdmin = `mailto:${OPERATOR_PUBLIC_EMAIL}?subject=${mailSubject}&body=${mailBody}`;

export default function DeleteMyDataStaticPage() {
  return (
    <div className="flex min-h-full flex-col bg-white text-zinc-900">
      <header className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <p className="text-sm font-semibold tracking-tight">SeaLink — delete my data</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-emerald-800">
            <Link href="/help" className="hover:underline">
              Help
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/" className="hover:underline">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Delete my data</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This page explains how to delete your SeaLink account and associated data. You do not need to be signed in to
          read it. There are no pop-ups here — only this text and normal links.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Canonical URL for stores:{" "}
          <a href={LIVE_PAGE} className="font-mono text-emerald-800 underline-offset-2 hover:underline">
            {LIVE_PAGE}
          </a>
        </p>

        <section className="mt-10 space-y-4 text-sm leading-7 text-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900">1. Who operates SeaLink</h2>
          <p>
            SeaLink is operated by an individual developer. For account and data-deletion requests, contact the operator
            at the email address below. Include the email address you use to sign in to SeaLink so we can find your
            account.
          </p>
          <p>
            <strong className="text-zinc-900">Operator contact:</strong>{" "}
            <a href={mailtoAdmin} className="font-medium text-emerald-800 underline-offset-2 hover:underline">
              {OPERATOR_PUBLIC_EMAIL}
            </a>
          </p>
          <p className="text-xs text-zinc-600">
            If your email app does not open from the link, copy this address manually:{" "}
            <span className="font-mono text-zinc-800">{OPERATOR_PUBLIC_EMAIL}</span>
          </p>
        </section>

        <section className="mt-10 space-y-4 text-sm leading-7 text-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900">2. Delete yourself in the app (fastest)</h2>
          <p>
            If you can sign in, use the in-app deletion flow: open{" "}
            <Link href="/delete-data" className="font-mono font-medium text-emerald-800 underline-offset-2 hover:underline">
              /delete-data
            </Link>{" "}
            on the same website where you use SeaLink (for example{" "}
            <a
              href="https://sealinkapp.com/delete-data"
              className="font-mono text-emerald-800 underline-offset-2 hover:underline"
            >
              https://sealinkapp.com/delete-data
            </a>
            ), sign in if asked, then follow the steps and confirm. That permanently deletes your SeaLink account and the
            data we store for your user id, subject to normal backups expiring.
          </p>
          <p>
            That page is separate from this one: this page is a simple information screen for app stores;{" "}
            <span className="font-mono text-zinc-700">/delete-data</span> is where the deletion action runs.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-sm leading-7 text-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900">3. If you cannot use the app</h2>
          <p>
            Email <span className="font-semibold text-zinc-900">{OPERATOR_PUBLIC_EMAIL}</span> from an address you can
            access. Use the subject line &quot;SeaLink — please delete my account and data&quot; and state clearly that you
            want your SeaLink account and associated personal data deleted. Include the email you used to register or sign
            in. We will verify ownership as far as reasonably possible and then delete or anonymise your account and data
            within a few business days, and reply when it is done.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-sm leading-7 text-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900">4. What is removed</h2>
          <p>
            Deletion removes your sign-in, profile, device registrations, listings you created (boats and gear), area
            broadcasts you authored, direct message threads you were part of, and billing or subscription rows we store for
            your user id where the database allows.
          </p>
          <p>
            If you signed in with Google, Apple, or Facebook, deleting SeaLink data does not delete your account with
            those companies — only your SeaLink account here.
          </p>
          <p>
            More detail is in our{" "}
            <Link href="/privacy" className="font-medium text-emerald-800 underline-offset-2 hover:underline">
              Privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/help#delete-data" className="font-medium text-emerald-800 underline-offset-2 hover:underline">
              Help — Delete your data
            </Link>
            .
          </p>
        </section>

        <section className="mt-10 space-y-4 text-sm leading-7 text-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900">5. After deletion</h2>
          <p>You may create a new account later with the same email if you wish.</p>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-zinc-50 py-6 text-center text-xs text-zinc-600">
        <p>SeaLink — data deletion information</p>
      </footer>
    </div>
  );
}
