/**
 * Anchor geofence alert: plays bundled MP3, repeats every 5 minutes until dismissed,
 * and stops automatically after 3 hours (alert UI may still be visible).
 *
 * Geofence breach is not a user gesture — `HTMLAudioElement.play()` is often blocked on
 * mobile Safari/Chrome. We therefore:
 * - Decode the clip once and play via Web Audio (`AudioBufferSourceNode`) after
 *   `AudioContext.resume()` runs during arming (user gesture) — see `primeAnchorAlarmAudio`.
 * - Fall back to `<audio>` if Web Audio is unavailable or fails.
 */

export const ANCHOR_ALERT_AUDIO_PUBLIC_PATH = "/sounds/anchor-alert.mp3";

const REPEAT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SOUND_DURATION_MS = 3 * 60 * 60 * 1000;

let repeatIntervalId: number | null = null;
let maxDurationTimeoutId: number | null = null;
let keepAliveIntervalId: number | null = null;
const KEEP_ALIVE_INTERVAL_MS = 25_000;

/* --- Web Audio (preferred on breach) --- */
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let decodedBuffer: AudioBuffer | null = null;
let decodePromise: Promise<AudioBuffer | null> | null = null;
const activeSources: AudioBufferSourceNode[] = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioContext.destination);
  return audioContext;
}

async function loadDecodedBuffer(): Promise<AudioBuffer | null> {
  if (decodedBuffer) return decodedBuffer;
  if (!decodePromise) {
    decodePromise = (async () => {
      const ctx = getAudioContext();
      if (!ctx) return null;
      const r = await fetch(ANCHOR_ALERT_AUDIO_PUBLIC_PATH, { cache: "force-cache" });
      if (!r.ok) throw new Error(`anchor sound HTTP ${r.status}`);
      const raw = await r.arrayBuffer();
      /* decodeAudioData may detach the buffer on some engines */
      return await ctx.decodeAudioData(raw.slice(0));
    })();
  }
  try {
    const buf = await decodePromise;
    decodePromise = null;
    if (buf) decodedBuffer = buf;
    return buf;
  } catch (err) {
    console.error("Error loading or decoding anchor alarm audio:", err);
    decodePromise = null;
    return null;
  }
}

function stopAllBufferSources(): void {
  for (const s of activeSources) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  activeSources.length = 0;
}

async function playOnceWebAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  const gain = masterGain;
  if (!ctx || !gain) return false;

  const buf = await loadDecodedBuffer();
  if (!buf) return false;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (err) {
      console.error("Failed to resume AudioContext inside playOnceWebAudio:", err);
      return false;
    }
  }

  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);
  } catch {
    gain.gain.value = 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.onended = () => {
    const i = activeSources.indexOf(src);
    if (i >= 0) activeSources.splice(i, 1);
  };
  activeSources.push(src);
  try {
    src.start(0);
    return true;
  } catch (err) {
    console.error("Failed to start Web Audio source node:", err);
    const i = activeSources.indexOf(src);
    if (i >= 0) activeSources.splice(i, 1);
    return false;
  }
}

/* --- HTMLAudio fallback --- */
let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio(ANCHOR_ALERT_AUDIO_PUBLIC_PATH);
    audioEl.preload = "auto";
    audioEl.volume = 1;
  }
  return audioEl;
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

async function playOnceHtmlAudio(): Promise<boolean> {
  pulseVibrate();
  const a = getAudio();
  try {
    a.volume = 1;
    a.pause();
    a.currentTime = 0;
  } catch {
    /* ignore */
  }
  try {
    await a.play();
    return true;
  } catch (err) {
    console.error("Failed to play HTML audio:", err);
    return false;
  }
}

/**
 * Call from a **user gesture** (e.g. Arm geofence): resumes `AudioContext`, starts MP3 decode,
 * and warms playback so a later geofence breach can play without another tap.
 */
export async function primeAnchorAlarmAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (ctx) {
    try {
      await loadDecodedBuffer();
      await ctx.resume();
      return ctx.state === "running";
    } catch (err) {
      console.error("Failed to prime Web Audio context:", err);
      return false;
    }
  }

  /* No Web Audio: inaudible <audio> play inside the gesture (don’t blast the full clip on Arm). */
  const a = getAudio();
  const prev = a.volume;
  try {
    a.volume = 0.0001;
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    await a.play();
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    return true;
  } catch (err) {
    console.error("Failed to prime HTML audio context fallback:", err);
    return false;
  } finally {
    try {
      a.volume = prev || 1;
    } catch {
      /* ignore */
    }
  }
}

async function playAlarmOnce(): Promise<boolean> {
  pulseVibrate();
  const web = await playOnceWebAudio();
  if (web) return true;
  return playOnceHtmlAudio();
}

function clearTimers(): void {
  if (repeatIntervalId != null) {
    window.clearInterval(repeatIntervalId);
    repeatIntervalId = null;
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

/** Stop playback, vibration, and timers (safe to call multiple times). */
export function stopAnchorAlarmSiren(): void {
  clearTimers();
  stopAllBufferSources();
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

/**
 * Start anchor alarm sound: play once, then every 5 minutes; hard stop after 3 hours.
 * Returns true if the first play started (not blocked by the browser).
 */
export async function startAnchorAlarmSiren(): Promise<boolean> {
  stopAnchorAlarmSiren();

  const ok = await playAlarmOnce();
  if (!ok) return false;

  repeatIntervalId = window.setInterval(() => {
    void playAlarmOnce();
  }, REPEAT_INTERVAL_MS);

  maxDurationTimeoutId = window.setTimeout(() => {
    stopAnchorAlarmSiren();
  }, MAX_SOUND_DURATION_MS);

  return true;
}

/**
 * Play a silent pulse through the AudioContext to prevent the browser from
 * suspending it while the anchor is armed. Call once after arming — it
 * repeats every ~25 s until {@link stopAnchorAlarmKeepAlive} is called.
 */
export function startAnchorAlarmKeepAlive(): void {
  stopAnchorAlarmKeepAlive();

  const ping = () => {
    const ctx = getAudioContext();
    if (!ctx || !masterGain) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const osc = ctx.createOscillator();
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      osc.connect(silentGain);
      silentGain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch {
      /* ignore */
    }
  };

  ping();
  keepAliveIntervalId = window.setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
}

/** Stop the keep-alive pulses (safe to call multiple times or when not running). */
export function stopAnchorAlarmKeepAlive(): void {
  if (keepAliveIntervalId != null) {
    window.clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
}
