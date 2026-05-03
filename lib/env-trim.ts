/** Trim and strip one pair of surrounding quotes (common when pasting into .env or dashboards). */
export function trimEnvValue(raw: string | undefined): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (s.length >= 2) {
    const q = s[0];
    if ((q === '"' || q === "'") && s[s.length - 1] === q) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}
