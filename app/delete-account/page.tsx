import type { Metadata } from "next";
import Link from "next/link";
import { HelpDeleteAccountSection } from "@/components/help/HelpDeleteAccountSection";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";

/** Avoid baking the wrong host at static build time — origin comes from env each request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Delete account | SeaLink",
  description: "Permanently delete your SeaLink account, profile, and data stored for your user id.",
  alternates: { canonical: "/delete-account" },
};

function liveDeleteUrl(): string {
  const o = resolvePublicAppOrigin();
  return `${o.replace(/\/$/, "")}/delete-account`;
}

export default function DeleteAccountPage() {
  const canonicalDelete = liveDeleteUrl();

  return (
    <div className="flex flex-1 flex-col bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            SeaLink
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm font-medium text-green-800 dark:text-green-400">
            <Link href="/help" className="hover:underline">
              Help
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Delete your account</h1>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Canonical URL:{" "}
          <a href={canonicalDelete} className="font-mono text-emerald-600 hover:underline dark:text-emerald-400">
            {canonicalDelete}
          </a>
        </p>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This page is open to everyone — you do <strong className="text-zinc-800 dark:text-zinc-200">not</strong> need to
          be signed in to read the steps below. Deleting your account cannot be undone once you confirm.
        </p>

        <div className="mt-8">
          <HelpDeleteAccountSection />
        </div>
      </main>
    </div>
  );
}
