/** Air-raid style alarm for incoming MOB; runs up to 5 minutes unless stopped. */

const MAX_MS = 5 * 60 * 1000;

/** Per-oscillator peak (two oscillators per tone; mixed via master). */
const PEAK = 0.34;
const BLAST_MS = 520;
const MASTER = 0.92;

let activeTeardown: (() => void) | null = null;
let sharedCtx: AudioContext | null = null;

function getSharedCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  sharedCtx = new AC();
  return sharedCtx;
}

/** Call from a user gesture to warm/unlock the shared AudioContext. */
export function primeMobSirenAudio(): void {
  const ctx = getSharedCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

export function stopMobSiren(): void {
  if (activeTeardown) {
    activeTeardown();
    activeTeardown = null;
  }
}

export function startMobSiren(): void {
  stopMobSiren();
  const ctx = getSharedCtx();
  if (!ctx) return;

  let running = true;
  let intervalId = 0;
  let timeoutId = 0;

  const master = ctx.createGain();
  master.gain.setValueAtTime(MASTER, ctx.currentTime);
  master.connect(ctx.destination);

  const teardown = () => {
    if (!running) return;
    running = false;
    if (intervalId) window.clearInterval(intervalId);
    if (timeoutId) window.clearTimeout(timeoutId);
    intervalId = 0;
    timeoutId = 0;
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    if (activeTeardown === teardown) activeTeardown = null;
  };

  activeTeardown = teardown;

  const blast = () => {
    if (!running || ctx.state === "closed") return;
    const t0 = ctx.currentTime;
    const freqs = [720, 980, 720, 1100];
    freqs.forEach((freq, i) => {
      const tStart = t0 + i * 0.11;
      for (const detune of [0, 6]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq + detune, tStart);
        g.gain.setValueAtTime(0.0001, tStart);
        g.gain.exponentialRampToValueAtTime(PEAK, tStart + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tStart + 0.11);
        o.connect(g);
        g.connect(master);
        o.start(tStart);
        o.stop(tStart + 0.12);
      }
    });
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      if (!running) return;
      blast();
      intervalId = window.setInterval(blast, BLAST_MS);
      timeoutId = window.setTimeout(() => stopMobSiren(), MAX_MS);
    });
  } else {
    blast();
    intervalId = window.setInterval(blast, BLAST_MS);
    timeoutId = window.setTimeout(() => stopMobSiren(), MAX_MS);
  }
}
