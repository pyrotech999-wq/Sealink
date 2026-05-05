"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { getDemoMe } from "@/lib/client/demo-me";
import { startNearbyPresence } from "@/lib/client/map-presence-client";
import {
  escapeHtml,
  getBoatName,
  getFullName,
  getShareNearbyPeers,
  getShareOnMap,
  setShareNearbyPeers,
  setShareOnMap,
} from "@/lib/map-profile-storage";
import { clampGeoAccuracyM, humanGeolocationMessage } from "@/lib/geolocation-utils";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";

type LatLngAcc = { lat: number; lng: number; accuracyM: number };
type NearbyPeer = { id: string; lat: number; lng: number; label: string; avatarDataUrl?: string };

const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
const DEFAULT_ZOOM = 8;

function buildMeIcon(label: string): L.DivIcon {
  const safe = escapeHtml(label || "You");
  const html = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-bottom:4px"><div style="width:40px;height:40px;border-radius:9999px;background:#16a34a;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff">●</div><span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,.95);font-size:11px;font-weight:600;color:#18181b;box-shadow:0 1px 4px rgba(0,0,0,.15)">${safe}</span></div>`;
  return L.divIcon({ className: "sealink-local-me", html, iconSize: [140, 72], iconAnchor: [70, 72] });
}

function buildPeerIcon(): L.DivIcon {
  const html = `<div style="width:34px;height:34px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>`;
  return L.divIcon({ className: "sealink-local-peer", html, iconSize: [34, 34], iconAnchor: [17, 17] });
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const did = useRef(false);
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!did.current) {
      did.current = true;
      map.setView([lat, lng], Math.max(map.getZoom(), DEFAULT_ZOOM));
      return;
    }
  }, [lat, lng, map]);
  return null;
}

export function LocalPresenceMap() {
  const [signedIn, setSignedIn] = useState(false);
  const [sharing, setSharing] = useState(() => (typeof window !== "undefined" ? getShareOnMap() : false));
  const [shareNearby, setShareNearby] = useState(() =>
    typeof window !== "undefined" ? getShareNearbyPeers() : false,
  );
  const [pos, setPos] = useState<LatLngAcc | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const [boatName, setBoatNameState] = useState(() => (typeof window !== "undefined" ? getBoatName() : ""));
  const [fullName, setFullNameState] = useState(() => (typeof window !== "undefined" ? getFullName() : ""));

  useEffect(() => {
    void getDemoMe()
      .then((d) => setSignedIn(Boolean(d.signedIn)))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!sharing) {
      setPos(null);
      setGeoErr(null);
      setNearbyPeers([]);
      return;
    }
    if (!navigator.geolocation) {
      setGeoErr("Geolocation is not supported in this browser.");
      return;
    }
    setGeoErr(null);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        const acc = clampGeoAccuracyM(p.coords.accuracy);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        setPos({ lat, lng, accuracyM: acc ?? 9999 });
      },
      (e) => setGeoErr(humanGeolocationMessage(e)),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing]);

  useEffect(() => {
    if (!signedIn || !sharing || !shareNearby || !pos) {
      setNearbyPeers([]);
      return;
    }
    return startNearbyPresence({
      signedIn,
      shareNearby,
      getCoords: () => ({ lat: pos.lat, lng: pos.lng }),
      getLabel: () => `${(boatName || "Boat").trim()} · ${(fullName || "").trim()}`.trim().slice(0, 40),
      onPeers: (peers) => setNearbyPeers(peers),
      onUnauthorized: () => setNearbyPeers([]),
    });
  }, [signedIn, sharing, shareNearby, pos?.lat, pos?.lng, boatName, fullName]);

  const center = useMemo<[number, number]>(() => {
    if (pos) return [pos.lat, pos.lng];
    return DEFAULT_CENTER;
  }, [pos?.lat, pos?.lng]);

  const meIcon = useMemo(() => buildMeIcon((boatName || "You").trim()), [boatName]);
  const peerIcon = useMemo(() => buildPeerIcon(), []);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Local map</h1>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Nearby users/boats only. No weather overlays here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !sharing;
              setSharing(next);
              setShareOnMap(next);
              if (!next) {
                setShareNearby(false);
                setShareNearbyPeers(false);
              }
            }}
            className={`h-9 rounded-lg px-3 text-sm font-semibold ${
              sharing
                ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {sharing ? "Sharing: ON" : "Share location"}
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
            <input
              type="checkbox"
              checked={shareNearby}
              disabled={!sharing || !signedIn || !pos}
              onChange={(e) => {
                const on = e.target.checked;
                setShareNearby(on);
                setShareNearbyPeers(on);
                if (!on) setNearbyPeers([]);
              }}
            />
            Nearby users
          </label>
        </div>
      </div>

      {geoErr ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {geoErr}
        </p>
      ) : null}
      {!signedIn ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Sign in to see nearby users.</p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="h-[420px] bg-zinc-100 dark:bg-zinc-900">
          <MapContainer center={center} zoom={DEFAULT_ZOOM} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <AttributionControl position="bottomright" prefix={false} />
            {pos ? <Recenter lat={pos.lat} lng={pos.lng} /> : null}
            {pos ? (
              <Marker position={[pos.lat, pos.lng]} icon={meIcon}>
                <Popup>
                  <p className="m-0 text-sm font-semibold">You</p>
                  <p className="m-0 text-xs text-zinc-600">GPS ±{Math.round(pos.accuracyM)}m</p>
                </Popup>
              </Marker>
            ) : null}
            {nearbyPeers.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={peerIcon}>
                <Popup>
                  <p className="m-0 text-sm font-semibold">{p.label || "Nearby boat"}</p>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <span>
            Showing <span className="font-semibold text-zinc-900 dark:text-zinc-100">{nearbyPeers.length}</span> nearby
            users.
          </span>
          <span>{pos ? `GPS ±${Math.round(pos.accuracyM)}m` : "Waiting for GPS…"}</span>
        </div>
      </div>
    </div>
  );
}

