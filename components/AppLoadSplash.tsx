"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SPLASH_MS = 2000;

/** Full-screen brand splash on first client paint; hides after a fixed delay while the app hydrates. */
export function AppLoadSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), SPLASH_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black p-6"
      role="img"
      aria-label="SeaLink loading"
    >
      <Image
        src="/sealink-brand-hero.png"
        alt=""
        width={512}
        height={512}
        priority
        className="max-h-[min(72vh,440px)] w-auto max-w-[min(92vw,400px)] object-contain"
      />
    </div>
  );
}
