import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use | SeaLink",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/sign-up" className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-400">
        ← Back to sign up
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Terms of use</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Placeholder page — replace with your real terms content or link to an external policy.
      </p>
    </div>
  );
}
