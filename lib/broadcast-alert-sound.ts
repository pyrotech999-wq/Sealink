/** Short two-tone chime for new area broadcasts (respects browser autoplay until user has interacted). */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

export function playBroadcastAlertSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    const t0 = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0 + start);
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.1, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.02);
    };
    tone(880, 0, 0.1);
    tone(660, 0.12, 0.12);
  };

  void ctx.resume().then(run).catch(() => {
    /* suspended until user gesture — ignore */
  });
}
