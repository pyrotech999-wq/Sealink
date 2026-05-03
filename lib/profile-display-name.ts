export const MIN_PROFILE_DISPLAY_NAME_LEN = 2;
export const MAX_PROFILE_DISPLAY_NAME_LEN = 120;

/** `null` = valid; otherwise a short error message for the UI / API. */
export function validateProfileDisplayName(raw: string): string | null {
  const t = raw.trim();
  if (t.length < MIN_PROFILE_DISPLAY_NAME_LEN) {
    return `Enter your name (at least ${MIN_PROFILE_DISPLAY_NAME_LEN} characters).`;
  }
  if (t.length > MAX_PROFILE_DISPLAY_NAME_LEN) {
    return `Name must be at most ${MAX_PROFILE_DISPLAY_NAME_LEN} characters.`;
  }
  return null;
}
