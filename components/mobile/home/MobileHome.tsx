'use client';

import LiveMarineForecast from './LiveMarineForecast';
import MobileLocationCard from './MobileLocationCard';
import { useCurrentLocation } from './useCurrentLocation';
import { useWindForecast } from './useWindForecast';
import Link from 'next/link';
import { MobileAiDailySummary } from './MobileAiDailySummary';
import { MobileSeaStateTideCard } from './MobileSeaStateTideCard';

interface MobileHomeProps {
  signedIn: boolean;
  welcomeFirstName: string | null;
}
import QuickActions from './QuickAction';
import { useRouter } from 'next/navigation';
import { useMeteo } from './useMeteo';
import { useState, useEffect } from 'react';
import { MobileAnchorAlertModal } from '@/components/mobile/home/MobileAnchorAlertModal';
import { getAnchorAlertConfig, setAnchorAlertConfig, type AnchorAlertConfig } from '@/lib/anchor-alert-storage';
import { getOrCreateDeviceId } from '@/lib/device-id';

export default function MobileHome({
  signedIn,
  welcomeFirstName,
}: MobileHomeProps) {
  const location = useCurrentLocation();
  const meteo = useMeteo(location?.lat, location?.lng);
  const forecast = useWindForecast(location?.lat, location?.lng);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const router = useRouter();

  // Dynamic state hooks for Anchor Alarm
  const [anchorCfg, setAnchorCfg] = useState<AnchorAlertConfig | null>(null);
  const [anchorMonitor, setAnchorMonitor] = useState<{ monitorDeviceId: string | null; alertDeviceIds: string[] } | null>(null);
  const [deviceId, setDeviceId] = useState("mobile");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDeviceId(getOrCreateDeviceId());
    }

    // Initial load
    setAnchorCfg(getAnchorAlertConfig({ isAdmin: false }));

    // Listen for storage changes (e.g. from the modal or background service)
    const handleUpdate = () => {
      setAnchorCfg(getAnchorAlertConfig({ isAdmin: false }));
    };

    window.addEventListener('storage', handleUpdate);

    // Polling interval to keep UI in sync
    const interval = setInterval(handleUpdate, 2000);

    // Fetch monitor configurations from the server
    void fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.monitor) {
          setAnchorMonitor(d.monitor);
        }
      })
      .catch(() => undefined);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#071b36] text-white flex flex-col overflow-hidden">
      {/* FIXED HEADER */}
      <div className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] bg-[#071b36]">
        <div className="flex items-center justify-between">
          <h1 className="text-[30px] font-bold">
            {signedIn
              ? welcomeFirstName
                ? `Welcome back, ${welcomeFirstName}`
                : 'Welcome back'
              : 'Stay linked'}
          </h1>

          <div className="h-12" />

        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto px-5 pb-28">
        <MobileLocationCard
          lat={location?.lat}
          lng={location?.lng}
          windSpeed={meteo?.windKph ?? undefined}
          windDirection={meteo?.windDirDeg ?? undefined}
        />

        <LiveMarineForecast forecast={forecast} />

        <MobileAiDailySummary />

        <MobileSeaStateTideCard />

        <QuickActions onAnchorClick={() => setAnchorOpen(true)} />
        {/* MAN OVERBOARD BUTTON */}
        <button className="mt-5 flex h-[56px] w-full items-center justify-center rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg" onClick={() => {
          const until = Date.now() + 10 * 60 * 1000; // 10 minutes active
          window.localStorage.setItem('sealink_mob_sender_active_until', String(until));
          router.push('/mob');
        }}>
          🛟 MAN OVERBOARD
        </button>
      </div>
      <MobileAnchorAlertModal
        open={anchorOpen}
        onClose={() => setAnchorOpen(false)}
        isAdmin={false}
        emergencyDisableLiveMapApis={false}
        sharing={true}
        hasFix={Boolean(location)}
        pos={
          location
            ? {
              lat: location.lat,
              lng: location.lng,
            }
            : null
        }
        horizontalAccuracyM={null}
        anchorGpsQuality={null}
        showIOSPreciseHint={false}
        deviceId={deviceId}
        monitor={anchorMonitor}
        config={
          anchorCfg || {
            armed: false,
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
            radiusM: 20,
            angleDeg: 360,
            monitorDeviceId: 'this',
            lastBearingDeg: null,
          }
        }
        onUpdate={(next) => {
          const merged: AnchorAlertConfig = {
            armed: next.armed,
            lat: next.lat,
            lng: next.lng,
            radiusM: next.radiusM,
            angleDeg: next.angleDeg,
            monitorDeviceId: next.monitorDeviceId,
            lastBearingDeg: next.lastBearingDeg !== undefined ? next.lastBearingDeg : (anchorCfg?.lastBearingDeg ?? null),
            lastAlertAt: anchorCfg?.lastAlertAt ?? null,
            remoteAlarmSilencedUntilReset: anchorCfg?.remoteAlarmSilencedUntilReset ?? false,
          };
          setAnchorCfg(merged);
          setAnchorAlertConfig(merged);
        }}
        onMonitorRolesSaved={(next) => setAnchorMonitor(next)}
      />
    </div>
  );
}
