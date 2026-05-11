/**
 * New message / broadcast alerts: plays a short notification chime via Web Audio API.
 * Falls back to bundled WAV if Web Audio is unavailable.
 *
 * `Silence message alerts` and `Message alert sound` prefs are enforced by callers
 * before invoking these.
 */

export const NEW_MESSAGE_VOICE_PUBLIC_PATH = "/sounds/new-message-voice.wav";

/* --- Web Audio chime (reliable on mobile once context is primed) --- */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function playChimeWebAudio(): boolean {
  const ctx = getCtx();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
    if (ctx.state === "suspended") return false;
  }
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    o1.frequency.setValueAtTime(1174.66, now + 0.12);
    o1.connect(gain);
    o1.start(now);
    o1.stop(now + 0.6);

    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1318.51, now + 0.12);
    o2.connect(gain2);
    o2.start(now + 0.12);
    o2.stop(now + 0.55);

    return true;
  } catch {
    return false;
  }
}

/**
 * Call from a user gesture (e.g. opening Messaging, tapping Send) to unlock
 * the AudioContext so future message chimes play without interaction.
 */
export function primeMessageAlertAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

/* --- HTMLAudio fallback --- */
let voiceAudio: HTMLAudioElement | null = null;

function getVoiceAudio(): HTMLAudioElement {
  if (!voiceAudio) {
    voiceAudio = new Audio(NEW_MESSAGE_VOICE_PUBLIC_PATH);
    voiceAudio.preload = "auto";
    voiceAudio.volume = 0.95;
  }
  return voiceAudio;
}

function playFallbackVoice(): void {
  const a = getVoiceAudio();
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    /* ignore */
  }
  void a.play().catch(() => {
    /* suspended until user gesture — ignore */
  });
}

function playNewMessageSound(): void {
  if (playChimeWebAudio()) return;
  playFallbackVoice();
}

/** Area broadcast toast: notification chime. */
export function playBroadcastAlertSound(): void {
  playNewMessageSound();
}

/** New private vicinity / DM / reply alert: same sound as broadcasts. */
export function playVicinityDmAlertSound(): void {
  playNewMessageSound();
}
