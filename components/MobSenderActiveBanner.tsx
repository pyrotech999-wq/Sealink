"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sealink_mob_sender_active_until";
const EVENT = "sealink-mob-sent";

function readUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function MobSenderActiveBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      const until = readUntil();
      if (until > 0 && until <= Date.now()) {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* */
        }
        setActive(false);
        return;
      }
      setActive(until > Date.now());
    };

    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onCustom as EventListener);
    const id = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, onCustom as EventListener);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className="sealink-mob-sender-bar pointer-events-none fixed right-0 left-0 z-[60] h-2 bg-red-600 shadow-[0_0_14px_rgba(220,38,38,0.85)]"
      style={{ top: 0, marginTop: "env(safe-area-inset-top, 0px)" }}
      role="status"
      aria-live="polite"
      aria-label="Man overboard alert is active on this device"
    />
  );
}

export { STORAGE_KEY as MOB_SENDER_ACTIVE_UNTIL_KEY, EVENT as MOB_SENDER_SENT_EVENT };
