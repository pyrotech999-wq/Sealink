/**
 * New message / broadcast alerts: plays bundled voice WAV (respects browser autoplay until user has interacted).
 * `Silence message alerts` and `Message alert sound` prefs are enforced by callers before invoking these.
 */

export const NEW_MESSAGE_VOICE_PUBLIC_PATH = "/sounds/new-message-voice.wav";

let voiceAudio: HTMLAudioElement | null = null;

function getVoiceAudio(): HTMLAudioElement {
  if (!voiceAudio) {
    voiceAudio = new Audio(NEW_MESSAGE_VOICE_PUBLIC_PATH);
    voiceAudio.preload = "auto";
    voiceAudio.volume = 0.95;
  }
  return voiceAudio;
}

function playNewMessageVoice(): void {
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

/** Area broadcast toast: voice clip “You have a message” style. */
export function playBroadcastAlertSound(): void {
  playNewMessageVoice();
}

/** New private vicinity / DM / reply alert: same voice clip as broadcasts. */
export function playVicinityDmAlertSound(): void {
  playNewMessageVoice();
}
