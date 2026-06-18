import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagingBroadcastClient } from "./MessagingBroadcastClient";
import { canSendGlobalAreaBroadcast, getAuthUser } from "@/lib/auth";
import MessagesSwitcher from "@/components/mobile/messages/MessagesSwitcher";

export const metadata: Metadata = {
  title: "Messages",
  description: "Area broadcasts and vicinity replies on SeaLink.",
};

export default async function MessagingPage() {
  const authUser = await getAuthUser();
  const signedIn = Boolean(authUser);
  const canSendGlobalBroadcast = authUser ? canSendGlobalAreaBroadcast(authUser.email) : false;

  return (
    <MessagesSwitcher signedIn={signedIn} canSendGlobalBroadcast={canSendGlobalBroadcast}>
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span aria-hidden>←</span> Home
        </Link>
        <header className="mt-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Messages
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Direct chats with IFM friends and area broadcasts from boaters nearby (~5 mi). Reply to a broadcast opens a
            shared thread.
          </p>
        </header>

        <div className="mt-8 flex-1">
          <Suspense
            fallback={
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                Loading messages…
              </div>
            }
          >
            <MessagingBroadcastClient signedIn={signedIn} canSendGlobalBroadcast={canSendGlobalBroadcast} />
          </Suspense>
        </div>
      </main>
    </div>
    </MessagesSwitcher>
  );
}
