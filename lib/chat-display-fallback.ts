/** Derive a short display label from an email local-part (no PII beyond what email already exposes). */
export function displayNameFromEmail(email: string): string | null {
  const raw = email.trim().toLowerCase();
  const at = raw.indexOf("@");
  const local = (at >= 0 ? raw.slice(0, at) : raw).replace(/\+.*$/, "");
  if (!local) return null;
  const parts = local.split(/[._\s-]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const pretty = parts
    .map((s) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
  return pretty || null;
}
