export function normalisePhone(phone: string): string {
  const raw = phone.trim();
  if (!raw) return "";
  // Keep digits and leading + only.
  const cleaned = raw.replace(/[^\d+]/g, "");
  // If user typed 00 prefix, convert to +
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2).replace(/[^\d]/g, "")}`;
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/[^\d]/g, "")}`;
  // Otherwise treat as digits (best-effort local format).
  return cleaned.replace(/[^\d]/g, "");
}

