/**
 * Anchor geofence alert: plays bundled MP3, repeats every 5 minutes until dismissed,
 * and stops automatically after 3 hours (alert UI may still be visible).
 * First play may require a user gesture — same as other web audio.
 */

export const ANCHOR_ALERT_AUDIO_PUBLIC_PATH = "/sounds/anchor-alert.mp3";

const REPEAT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SOUND_DURATION_MS = 3 * 60 * 60 * 1000;

let audioEl: HTMLAudioElement | null = null;
let repeatIntervalId: number | null = null;
let maxDurationTimeoutId: number | null = null;

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

function playClip(): void {
  pulseVibrate();
  const a = getAudio();
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    /* ignore */
  }
  void a.play().catch(() => {
    /* e.g. interrupted — ignore */
  });
}

/**
 * Best-effort: unlock audio playback via a user gesture.
 * Plays the anchor alert clip at near-zero volume and immediately pauses it so later alarm plays aren't blocked.
 */
export async function primeAnchorAlarmAudio(): Promise<boolean> {
  const a = getAudio();
  const prevVol = a.volume;
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
  } catch {
    return false;
  } finally {
    try {
      a.volume = prevVol || 1;
    } catch {
      /* ignore */
    }
  }
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
  const a = getAudio();
  pulseVibrate();
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    /* ignore */
  }
  try {
    await a.play();
  } catch {
    return false;
  }

  repeatIntervalId = window.setInterval(() => {
    playClip();
  }, REPEAT_INTERVAL_MS);

  maxDurationTimeoutId = window.setTimeout(() => {
    stopAnchorAlarmSiren();
  }, MAX_SOUND_DURATION_MS);

  return true;
}
