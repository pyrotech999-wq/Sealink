/** Block obvious whole-boat / hull sales; gear wording should still pass. */
const BANNED = [
  /\b(yacht|motor\s*yacht|sailing\s*yacht)\s+(for\s*sale|f\/s|fs)\b/i,
  /\b(hull|fibreglass\s*hull|GRP\s*hull)\s+(for\s*sale|f\/s)\b/i,
  /\b(complete\s*)?(sail|motor)\s*boat\s+(only|for\s*sale)\b/i,
  /\b(vessel)\s+for\s+sale\b/i,
];

export function looksLikeBoatSale(title: string, description: string): boolean {
  const blob = `${title}\n${description}`;
  return BANNED.some((re) => re.test(blob));
}

export function validateGearText(title: string, description: string): string | null {
  const t = title.trim();
  const d = description.trim();
  if (t.length < 3 || t.length > 140) return "Title must be between 3 and 140 characters.";
  if (d.length < 10 || d.length > 8000) return "Description must be between 10 and 8000 characters.";
  if (looksLikeBoatSale(t, d)) return "This tab is for boat equipment and gear only — not boats, hulls or bare hulls.";
  return null;
}
