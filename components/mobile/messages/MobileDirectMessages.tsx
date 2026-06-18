'use client';

import { useEffect, useState } from 'react';

type InboxThread = {
  threadId: string;
  peerUid: string;
  lastMessageId: string;
  lastBody: string;
  lastAt: string;
  lastIsMine: boolean;
};

function formatTime(date: string) {
  const d = new Date(date);

  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MobileDirectMessages() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch('/api/vicinity-dm/inbox')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;

        setThreads(data.threads ?? []);
      })
      .catch(console.error)
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-8 text-center text-zinc-400">
        Loading conversations...
      </div>
    );
  }

  if (!threads.length) {
    return (
      <div className="py-8 text-center text-zinc-400">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {threads.map(thread => {
        const initials = thread.peerUid
          .slice(0, 2)
          .toUpperCase();

        return (
          <button
            key={thread.threadId}
            className="
              flex
              w-full
              items-center
              gap-3
              border-b
              border-white/5
              py-3
              text-left
            "
          >
            {/* Avatar */}

            <div
              className="
                flex
                h-12
                w-12
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-slate-600
                font-semibold
                text-white
              "
            >
              {initials}
            </div>

            {/* Message Content */}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">
                {thread.peerUid}
              </p>

              <p className="truncate text-sm text-zinc-400">
                {thread.lastBody}
              </p>
            </div>

            {/* Right Side */}

            <div className="flex flex-col items-end">
              <span className="text-xs text-zinc-500">
                {formatTime(thread.lastAt)}
              </span>

              {!thread.lastIsMine && (
                <div className="mt-2 h-2.5 w-2.5 rounded-full bg-cyan-400" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}