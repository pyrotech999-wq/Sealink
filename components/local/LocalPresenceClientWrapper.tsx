"use client";

import dynamic from "next/dynamic";

const LocalPresenceMap = dynamic(
  () => import("./LocalPresenceMap").then((m) => m.LocalPresenceMap),
  { ssr: false },
);

export function LocalPresenceClientWrapper() {
  return <LocalPresenceMap />;
}

