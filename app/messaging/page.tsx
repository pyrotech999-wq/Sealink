import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { MessagingBroadcastClient } from "./MessagingBroadcastClient";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/demo-session";
import { canSendGlobalAreaBroadcast, getAuthUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Messages",
  description: "Area broadcasts and vicinity replies on SeaLink.",
};

export default async function MessagingPage() {
  const jar = await cookies();
  const signedIn = jar.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  const authUser = await getAuthUser();
  const canSendGlobalBroadcast = authUser ? canSendGlobalAreaBroadcast(authUser.email) : false;

  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/" className="text-sm font-medium text-green-800 hover:underline dark:text-green-400">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Messages
        </h1>

        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-zinc-500">Loading messages…</p>}>
            <MessagingBroadcastClient signedIn={signedIn} canSendGlobalBroadcast={canSendGlobalBroadcast} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
