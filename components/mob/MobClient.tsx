// components/mob/MobClient.tsx
"use client";

import { useEffect } from "react";
import { useCurrentLocation } from "@/components/mobile/home/useCurrentLocation";
import { useRouter } from "next/navigation";

export default function MobClient() {
  const location = useCurrentLocation();
  const router = useRouter();

  // Redirect if no active MOB flag
  useEffect(() => {
    const active = !!window.localStorage.getItem("sealink_mob_sender_active_until");
    if (!active) router.push("/");
  }, [router]);

  const handleCancel = async () => {
    const body = {
      lat: location?.lat,
      lng: location?.lng,
    };
    const response = await fetch("/api/map/mob/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      window.localStorage.removeItem("sealink_mob_sender_active_until");
      router.push("/");
    } else {
      const err = await response.json();
      alert(`Failed to cancel MOB alert: ${err.error || "unknown"}`);
    }
  };

  // Mobile‑first layout, desktop falls back to original glass‑card styling
  return (
    <section className="flex flex-col items-center justify-center min-h-screen bg-[#071b36] text-white p-6 sm:max-w-2xl sm:mx-auto sm:glass-card">
      <h1 className="mb-4 text-2xl font-bold text-white">Man Overboard Alert</h1>
      <p className="mb-4 text-zinc-200">
        An active MOB broadcast is in progress. Use the button below to cancel the alert when the emergency is over.
      </p>
      <button
        onClick={handleCancel}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
      >
        Cancel MOB Broadcast
      </button>
    </section>
  );
}
