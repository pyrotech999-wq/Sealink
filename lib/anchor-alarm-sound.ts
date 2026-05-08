/**
 * Loud police-style siren + vibration while an anchor geofence alert is active.
 * Uses Web Audio (sawtooth sweeps). Requires a resumed AudioContext — may stay silent until user gesture.
 */

let sirenCtx: AudioContext | null = null;
let wailIntervalId: number | null = null;
let vibrateIntervalId: number | null = null;
let maxDurationTimeoutId: number | null = null;
/** Alternate up-sweep / down-sweep each wail for a classic “woo-WOO” siren feel */
let wailRising = true;

const WAIL_INTERVAL_MS = 520;
const MAX_DURATION_MS = 15 * 60_000;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sirenCtx || sirenCtx.state === "closed") {
    sirenCtx = new AC();
  }
  return sirenCtx;
}

function scheduleWail(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  const dur = 0.46;
  const lo = 560;
  const hi = 1280;
  const startF = wailRising ? lo : hi;
  const endF = wailRising ? hi : lo;
  wailRising = !wailRising;

  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const g = ctx.createGain();
  o.frequency.setValueAtTime(startF, t0);
  o.frequency.linearRampToValueAtTime(endF, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.32, t0 + 0.02);
  g.gain.linearRampToValueAtTime(0.08, t0 + dur * 0.55);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);

  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
}

function pulseVibrate(): void {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([0, 220, 100, 220, 100, 380, 120, 280]);
    }
  } catch {
    /* ignore */
  }
}

function clearTimers(): void {
  if (wailIntervalId != null) {
    window.clearInterval(wailIntervalId);
    wailIntervalId = null;
  }
  if (vibrateIntervalId != null) {
    window.clearInterval(vibrateIntervalId);
    vibrateIntervalId = null;
  }
  if (maxDurationTimeoutId != null) {
    window.clearTimeout(maxDurationTimeoutId);
    maxDurationTimeoutId = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

/** Stop siren, vibration, and timers (safe to call multiple times). */
export function stopAnchorAlarmSiren(): void {
  clearTimers();
  wailRising = true;
  if (sirenCtx && sirenCtx.state !== "closed") {
    void sirenCtx.suspend().catch(() => undefined);
  }
}

/**
 * Start repeating siren + vibration. Returns true if audio context is available and resumed.
 */
export async function startAnchorAlarmSiren(): Promise<boolean> {
  stopAnchorAlarmSiren();
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return false;
  }

  scheduleWail(ctx);
  wailIntervalId = window.setInterval(() => {
    try {
      scheduleWail(ctx);
    } catch {
      /* ignore */
    }
  }, WAIL_INTERVAL_MS);

  pulseVibrate();
  vibrateIntervalId = window.setInterval(pulseVibrate, 1100);

  maxDurationTimeoutId = window.setTimeout(() => {
    stopAnchorAlarmSiren();
  }, MAX_DURATION_MS);

  return true;
}
