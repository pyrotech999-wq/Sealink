"use client";

import { useCallback, useState } from "react";
import { getBoatName, getFullName, getProfilePhone } from "@/lib/map-profile-storage";
import { getLastKnownPosition } from "@/lib/map-last-known";
import { MOB_SENDER_ACTIVE_UNTIL_KEY, MOB_SENDER_SENT_EVENT } from "@/components/MobSenderActiveBanner";

type Props = {
  signedIn: boolean;
};

function getMobPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    const fallback = getLastKnownPosition(2 * 60 * 60 * 1000);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (fallback) resolve({ lat: fallback.lat, lng: fallback.lng });
      else reject(new Error("Location not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        if (fallback) resolve({ lat: fallback.lat, lng: fallback.lng });
        else reject(new Error("Could not get GPS. Allow location or use the map to fix position first."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  });
}

export function ManOverboardAlertButton({ signedIn }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const sendMob = useCallback(async () => {
    setSending(true);
    setBanner(null);
    try {
      const { lat, lng } = await getMobPosition();
      const r = await fetch("/api/map/mob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lng,
          fullName: getFullName(),
          boatName: getBoatName(),
          phone: getProfilePhone(),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setBanner(d.error || "Could not send MOB alert");
        return;
      }
      try {
        const until = Date.now() + 5 * 60 * 1000;
        window.localStorage.setItem(MOB_SENDER_ACTIVE_UNTIL_KEY, String(until));
        window.dispatchEvent(new Event(MOB_SENDER_SENT_EVENT));
      } catch {
        /* */
      }
      setBanner("MOB alert sent to nearby boaters (within ~10 miles).");
      setConfirmOpen(false);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Could not send alert");
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <div className="mt-10 mb-1">
      <button
        type="button"
        disabled={!signedIn}
        onClick={() => {
          setBanner(null);
          setConfirmOpen(true);
        }}
        className="w-full rounded-2xl bg-red-600 px-4 py-5 text-center text-lg font-bold tracking-wide text-white shadow-lg shadow-red-900/30 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
      >
        MAN OVERBOARD
      </button>
      {!signedIn ? (
        <p className="mt-2 text-center text-xs text-zinc-500">Sign in to send a man overboard alert.</p>
      ) : (
        <p className="mt-2 text-center text-xs text-zinc-500">
          Sends your position, name, boat, email and phone to signed-in users within ~10 miles. Only use in a real
          emergency.
        </p>
      )}

      {banner ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            banner.startsWith("MOB alert sent")
              ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-200"
              : "border-red-800/50 bg-red-950/40 text-red-200"
          }`}
        >
          {banner}
        </p>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => !sending && setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mob-confirm-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-red-900/50 bg-zinc-950 p-5 shadow-xl"
          >
            <h2 id="mob-confirm-title" className="text-lg font-semibold text-red-100">
              Confirm MOB assistance required?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              This will broadcast your live position (or last known GPS), coordinates, email, boat name, your name, and
              phone number to other signed-in users within about <strong className="text-zinc-100">10 miles</strong>.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="h-11 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendMob()}
                className="h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Yes, send alert"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
