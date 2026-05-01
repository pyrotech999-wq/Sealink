/** Air-raid style alarm for incoming MOB; runs up to 5 minutes unless stopped. */

const MAX_MS = 5 * 60 * 1000;

let activeTeardown: (() => void) | null = null;

export function stopMobSiren(): void {
  if (activeTeardown) {
    activeTeardown();
    activeTeardown = null;
  }
}

export function startMobSiren(): void {
  stopMobSiren();
  if (typeof window === "undefined") return;

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;

  const ctx = new AC();
  let running = true;
  let intervalId = 0;
  let timeoutId = 0;

  const teardown = () => {
    if (!running) return;
    running = false;
    if (intervalId) window.clearInterval(intervalId);
    if (timeoutId) window.clearTimeout(timeoutId);
    intervalId = 0;
    timeoutId = 0;
    void ctx.close().catch(() => undefined);
    if (activeTeardown === teardown) activeTeardown = null;
  };

  activeTeardown = teardown;

  const blast = () => {
    if (!running || ctx.state === "closed") return;
    const t0 = ctx.currentTime;
    const freqs = [720, 980, 720, 1100];
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t0 + i * 0.11);
      g.gain.setValueAtTime(0.0001, t0 + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.11 + 0.1);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + i * 0.11);
      o.stop(t0 + i * 0.11 + 0.11);
    });
  };

  void ctx.resume().then(() => {
    if (!running) return;
    blast();
    intervalId = window.setInterval(blast, 650);
    timeoutId = window.setTimeout(() => stopMobSiren(), MAX_MS);
  });
}
