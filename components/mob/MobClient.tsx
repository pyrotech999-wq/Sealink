// components/mob/MobClient.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCurrentLocation } from "@/components/mobile/home/useCurrentLocation";
import { useRouter } from "next/navigation";
import { getLastKnownPosition } from "@/lib/map-last-known";

type Phase =
  | "confirm"       // Awaiting user confirmation before sending
  | "sending"       // POST in flight
  | "active"        // MOB broadcast live, waiting for cancel
  | "cancelling"    // Cancel POST in flight
  | "done"          // Cancelled
  | "error";        // Unrecoverable error

type Profile = {
  fullName?: string | null;
  boatName?: string | null;
  phone?: string | null;
};

export default function MobClient() {
  const location = useCurrentLocation();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("confirm");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  /** Prevent double-fire if the component remounts. */
  const sentRef = useRef(false);

  // Redirect immediately if no active MOB flag
  useEffect(() => {
    const active = !!window.localStorage.getItem("sealink_mob_sender_active_until");
    if (!active) router.replace("/");
  }, [router]);

  // Fetch profile in background so we can include name/boat/phone in the broadcast
  useEffect(() => {
    void fetch("/api/profiles/me", { credentials: "same-origin", cache: "no-store" })
      .then(r => r.json())
      .then((d: unknown) => {
        const p = d as Profile;
        setProfile({
          fullName: typeof p.fullName === "string" ? p.fullName : null,
          boatName: typeof p.boatName === "string" ? p.boatName : null,
          phone: typeof p.phone === "string" ? p.phone : null,
        });
      })
      .catch(() => { /* ignore — profile fields are optional */ });
  }, []);

  const sendBroadcast = useCallback(async () => {
    if (sentRef.current) return;
    sentRef.current = true;
    setPhase("sending");
    setErrorMsg(null);

    // Wait up to 5 s for GPS if we don't have it yet
    const pos = location ?? await new Promise<{ lat: number; lng: number } | null>(resolve => {
      const timeout = setTimeout(() => resolve(null), 5000);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(timeout); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        () => { clearTimeout(timeout); resolve(null); },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });

    if (!pos) {
      setPhase("error");
      setErrorMsg("Could not obtain GPS location. Please enable location permissions and try again.");
      sentRef.current = false;
      return;
    }

    try {
      const res = await fetch("/api/map/mob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          lat: pos.lat,
          lng: pos.lng,
          fullName: profile.fullName ?? "",
          boatName: profile.boatName ?? "",
          phone: profile.phone ?? "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok) {
        setPhase("error");
        setErrorMsg(data.error ?? `Server error ${res.status}`);
        sentRef.current = false;
        return;
      }
      setBroadcastId(data.id ?? null);
      setPhase("active");
    } catch (err) {
      setPhase("error");
      setErrorMsg("Network error — check your connection and try again.");
      sentRef.current = false;
    }
  }, [location, profile]);

  const cancelBroadcast = useCallback(async () => {
    setPhase("cancelling");
    try {
      // Use live location first, then stored last-known position as fallback
      const pos = location ?? getLastKnownPosition();
      const res = await fetch("/api/map/mob/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          fullName: profile.fullName ?? "",
          boatName: profile.boatName ?? "",
          phone: profile.phone ?? "",
        }),
      });
      if (res.ok) {
        window.localStorage.removeItem("sealink_mob_sender_active_until");
        setPhase("done");
        setTimeout(() => router.replace("/"), 2000);
      } else {
        const err = (await res.json()) as { error?: string };
        setPhase("active");
        setErrorMsg(err.error ?? "Failed to cancel. Please try again.");
      }
    } catch {
      setPhase("active");
      setErrorMsg("Network error cancelling alert. Try again.");
    }
  }, [location, profile, router]);

  // ----------------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------------

  // Confirmation screen
  if (phase === "confirm") {
    return (
      <div className="fixed inset-0 bg-red-950 flex flex-col items-center justify-center text-white px-6 text-center">
        <div className="text-6xl mb-4">🆘</div>
        <h1 className="text-3xl font-black tracking-tight uppercase mb-2">Man Overboard</h1>
        <p className="text-red-200 text-sm leading-relaxed max-w-sm mb-6">
          This will broadcast an <strong className="text-white">emergency alert</strong> to all SeaLink users within{" "}
          <strong className="text-white">10 miles</strong> of your current position, showing your GPS coordinates.
        </p>

        {location ? (
          <p className="text-red-300 text-xs mb-8 font-mono bg-red-900/50 px-3 py-1.5 rounded-lg">
            📍 GPS ready: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </p>
        ) : (
          <p className="text-red-400 text-xs mb-8 animate-pulse">⏳ Acquiring GPS…</p>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={() => void sendBroadcast()}
            className="flex items-center justify-center gap-2 h-14 w-full rounded-2xl bg-red-500 font-black text-lg text-white shadow-2xl active:scale-[0.98] transition-transform border-2 border-red-400"
          >
            🛟 YES — SEND MOB ALERT
          </button>
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem("sealink_mob_sender_active_until");
              router.replace("/");
            }}
            className="h-12 w-full rounded-2xl border border-red-700/50 bg-red-900/40 text-sm font-bold text-red-200 active:scale-[0.98] transition-transform"
          >
            Cancel — No Emergency
          </button>
        </div>
      </div>
    );
  }

  // Sending…
  if (phase === "sending") {
    return (
      <div className="fixed inset-0 bg-red-950 flex flex-col items-center justify-center text-white px-6 text-center">
        <div className="size-14 rounded-full border-4 border-red-400 border-t-transparent animate-spin mb-6" />
        <h2 className="text-xl font-black uppercase tracking-wider text-red-200">Sending Alert…</h2>
        <p className="text-red-400 text-sm mt-2">Broadcasting to nearby vessels</p>
      </div>
    );
  }

  // Active MOB
  if (phase === "active") {
    return (
      <div className="fixed inset-0 bg-red-950 flex flex-col overflow-hidden">
        {/* Pulsing header */}
        <div className="shrink-0 bg-red-600 animate-pulse px-6 py-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.3em] text-red-100">🆘 ALERT ACTIVE</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center text-white gap-5">
          <div className="text-5xl">🛟</div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Man Overboard</h1>
            <p className="text-red-200 text-sm mt-1">Alert broadcast to all users within 10 miles</p>
          </div>

          {/* GPS */}
          {location && (
            <div className="rounded-xl bg-red-900/60 border border-red-700/50 px-4 py-3 w-full max-w-xs">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-400 mb-1">Your position (broadcast)</p>
              <p className="font-mono text-sm text-white">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
              <a
                href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-red-300 underline mt-1 block"
              >
                Open in Google Maps
              </a>
            </div>
          )}

          {/* Profile info shown */}
          {(profile.fullName || profile.boatName) && (
            <div className="rounded-xl bg-red-900/40 border border-red-800/40 px-4 py-3 w-full max-w-xs text-left">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-400 mb-1">Broadcast identity</p>
              {profile.fullName && <p className="text-sm text-white font-bold">{profile.fullName}</p>}
              {profile.boatName && <p className="text-xs text-red-200">{profile.boatName}</p>}
              {profile.phone && <p className="text-xs text-red-300 mt-0.5">📞 {profile.phone}</p>}
            </div>
          )}

          {errorMsg && (
            <p className="rounded-xl border border-red-600 bg-red-900/50 px-4 py-2 text-sm text-red-200">
              {errorMsg}
            </p>
          )}

          <p className="text-xs text-red-400 max-w-xs leading-relaxed">
            Nearby SeaLink users can see this alert on the map. Keep this screen open. Tap{" "}
            <strong className="text-red-200">Cancel Alert</strong> once the person is safe.
          </p>

          <button
            type="button"
            onClick={() => void cancelBroadcast()}
            className="h-14 w-full max-w-xs rounded-2xl bg-emerald-600 font-black text-lg text-white shadow-2xl active:scale-[0.98] transition-transform border-2 border-emerald-500"
          >
            ✅ Cancel Alert — Person is Safe
          </button>
        </div>
      </div>
    );
  }

  // Cancelling…
  if (phase === "cancelling") {
    return (
      <div className="fixed inset-0 bg-emerald-950 flex flex-col items-center justify-center text-white px-6 text-center">
        <div className="size-14 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin mb-6" />
        <h2 className="text-xl font-black uppercase tracking-wider text-emerald-200">Cancelling Alert…</h2>
      </div>
    );
  }

  // Done / cancelled
  if (phase === "done") {
    return (
      <div className="fixed inset-0 bg-emerald-950 flex flex-col items-center justify-center text-white px-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-black uppercase tracking-tight text-emerald-100">Alert Cancelled</h2>
        <p className="text-emerald-300 text-sm mt-2">Returning to home screen…</p>
      </div>
    );
  }

  // Error
  return (
    <div className="fixed inset-0 bg-[#071b36] flex flex-col items-center justify-center text-white px-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-black text-red-300 mb-2">Alert Failed</h2>
      <p className="text-sm text-zinc-300 mb-6 max-w-sm">{errorMsg ?? "An unexpected error occurred."}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={() => { sentRef.current = false; setPhase("confirm"); }}
          className="h-12 w-full rounded-xl bg-red-600 text-sm font-bold text-white active:scale-[0.98] transition-transform"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem("sealink_mob_sender_active_until");
            router.replace("/");
          }}
          className="h-12 w-full rounded-xl border border-white/20 bg-white/5 text-sm font-bold text-zinc-300 active:scale-[0.98] transition-transform"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}
