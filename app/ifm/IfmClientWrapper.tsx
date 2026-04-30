"use client";

import dynamic from "next/dynamic";

const IfmMapClient = dynamic(() => import("./IfmMapClient").then((m) => m.IfmMapClient), { ssr: false });

export function IfmClientWrapper() {
  return <IfmMapClient />;
}

