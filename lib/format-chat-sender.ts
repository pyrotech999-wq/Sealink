/** Line above a chat bubble: viewer name + optional boat from `profiles` (server-enriched). */
export function formatChatSenderLine(
  isMine: boolean,
  senderUid: string,
  displayName: string | null | undefined,
  boatName: string | null | undefined,
): string {
  if (isMine) return "You";
  const name = (displayName ?? "").trim();
  const boat = (boatName ?? "").trim();
  if (name && boat) return `${name} · ${boat}`;
  if (name) return name;
  if (boat) return boat;
  const u = senderUid;
  return u.length > 14 ? `${u.slice(0, 14)}…` : u;
}
