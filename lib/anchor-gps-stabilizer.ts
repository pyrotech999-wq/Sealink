import { distanceMeters } from "@/lib/geo-haversine";

/** Horizontal accuracy gate for anchor monitoring (metres). Fixes worse than this are ignored for drift logic. */
export const ANCHOR_MAX_HORIZ_ACCURACY_M = 42;

/** Samples in a tight cluster required before we trust a new fix while anchored. */
const STABLE_SAMPLE_TARGET = 3;
/** Max pairwise spread (m) among the last {@link STABLE_SAMPLE_TARGET} accepted samples. */
const STABLE_CLUSTER_MAX_M = 18;
const BUFFER_CAP = 8;
/** After this long with no tight cluster, accept centroid of the last few samples (open-sky assist). */
const SOFT_ACCEPT_AFTER_MS = 14_000;
/** Reject centroid jumps that imply unrealistic speed (m/s) vs previous published fix — dampens urban multipath. */
const MAX_IMPLAUSIBLE_SPEED_MS = 6;

export type AnchorGpsQuality = "ok" | "waiting_stable" | "poor_accuracy";

export type LatLngAcc = { lat: number; lng: number; accuracyM: number };

export type GeoSample = { lat: number; lng: number; accuracyM: number; t: number };

export type AnchorGpsStabilizerState = {
  buffer: GeoSample[];
  lastOut: LatLngAcc | null;
  firstSampleAt: number;
  lastPublishAt: number;
};

export function createAnchorGpsStabilizer(): AnchorGpsStabilizerState {
  return {
    buffer: [],
    lastOut: null,
    firstSampleAt: 0,
    lastPublishAt: 0,
  };
}

function clusterTight(samples: GeoSample[], maxSpreadM: number): boolean {
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const d = distanceMeters(samples[i].lat, samples[i].lng, samples[j].lat, samples[j].lng);
      if (d > maxSpreadM) return false;
    }
  }
  return true;
}

/**
 * When the anchor is armed, filters GPS for stability and accuracy so drift alerts are not dominated
 * by jitter or coarse “reduced accuracy” fixes. When disarmed, pass samples through unchanged.
 */
export function processAnchorGeoSample(
  state: AnchorGpsStabilizerState,
  sample: GeoSample,
  opts: { armed: boolean; maxAccuracyM: number },
): { fix: LatLngAcc | null; quality: AnchorGpsQuality | null } {
  if (!opts.armed) {
    return {
      fix: { lat: sample.lat, lng: sample.lng, accuracyM: sample.accuracyM },
      quality: null,
    };
  }

  if (!Number.isFinite(sample.accuracyM) || sample.accuracyM > opts.maxAccuracyM) {
    return { fix: state.lastOut, quality: "poor_accuracy" };
  }

  if (state.buffer.length === 0) state.firstSampleAt = sample.t;
  state.buffer.push(sample);
  if (state.buffer.length > BUFFER_CAP) state.buffer.shift();

  const recent = state.buffer.slice(-STABLE_SAMPLE_TARGET);
  const tight =
    recent.length >= STABLE_SAMPLE_TARGET &&
    clusterTight(recent, STABLE_CLUSTER_MAX_M) &&
    recent.every((s) => s.accuracyM <= opts.maxAccuracyM);

  const softAccept =
    state.buffer.length >= 4 && sample.t - state.firstSampleAt >= SOFT_ACCEPT_AFTER_MS && !tight;

  if (!tight && !softAccept) {
    return { fix: state.lastOut, quality: state.lastOut ? "ok" : "waiting_stable" };
  }

  const pool = tight ? recent : state.buffer.slice(-3);
  const lat = pool.reduce((s, p) => s + p.lat, 0) / pool.length;
  const lng = pool.reduce((s, p) => s + p.lng, 0) / pool.length;
  const acc = pool.reduce((s, p) => s + p.accuracyM, 0) / pool.length;

  if (state.lastOut) {
    const dtSec = Math.max(0.35, (sample.t - state.lastPublishAt) / 1000);
    const d = distanceMeters(lat, lng, state.lastOut.lat, state.lastOut.lng);
    if (d / dtSec > MAX_IMPLAUSIBLE_SPEED_MS) {
      return { fix: state.lastOut, quality: "ok" };
    }
  }

  const alpha = 0.45;
  const next: LatLngAcc = state.lastOut
    ? {
        lat: alpha * lat + (1 - alpha) * state.lastOut.lat,
        lng: alpha * lng + (1 - alpha) * state.lastOut.lng,
        accuracyM: alpha * acc + (1 - alpha) * state.lastOut.accuracyM,
      }
    : { lat, lng, accuracyM: acc };

  state.lastOut = next;
  state.lastPublishAt = sample.t;
  return { fix: next, quality: "ok" };
}
