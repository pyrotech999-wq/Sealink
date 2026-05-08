/** Foreground: tab visible — broadcasts, inbox, friends, open chats. */
export const MESSAGE_POLL_FOREGROUND_MS = 15_000;
/** Background: tab hidden — same endpoints, lower rate to save battery/data. */
export const MESSAGE_POLL_BACKGROUND_MS = 60_000;

export function getMessagePollDelayMs(): number {
  if (typeof document === "undefined") return MESSAGE_POLL_FOREGROUND_MS;
  return document.visibilityState === "hidden" ? MESSAGE_POLL_BACKGROUND_MS : MESSAGE_POLL_FOREGROUND_MS;
}
