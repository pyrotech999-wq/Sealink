"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SPLASH_MS = 2000;

function isNoSplashPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return (
    path === "/delete-data" ||
    path.startsWith("/delete-data/") ||
    path === "/delete-account" ||
    path.startsWith("/delete-account/")
  );
}

/** Full-screen brand splash on first client paint; hides after a fixed delay while the app hydrates. Skipped on `/delete-data`. */
export function AppLoadSplash() {
  const pathname = usePathname();
  const [skip, setSkip] = useState(false);

  useLayoutEffect(() => {
    if (isNoSplashPath(pathname) || isNoSplashPath(window.location.pathname)) {
      setSkip(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (skip) return;
    const id = window.setTimeout(() => setSkip(true), SPLASH_MS);
    return () => window.clearTimeout(id);
  }, [skip]);

  if (skip) return null;

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
