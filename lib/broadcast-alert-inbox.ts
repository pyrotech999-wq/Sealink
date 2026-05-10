export type BroadcastAlertVariant = "broadcast" | "vicinity";

export type PersistedBroadcastAlert = {
  key: string;
  text: string;
  variant: BroadcastAlertVariant;
  receivedAt: number;
  /** User tapped Seen — stays in the 24h list for Older/Newer unless Deleted. */
  seen: boolean;
  deleted: boolean;
};

export const BROADCAST_ALERT_INBOX_STORAGE_KEY = "sealink_vicinity_alert_inbox_v2";
const LS_KEY = BROADCAST_ALERT_INBOX_STORAGE_KEY;
export const BROADCAST_ALERT_TTL_MS = 24 * 60 * 60 * 1000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function pruneBroadcastAlerts(items: PersistedBroadcastAlert[]): PersistedBroadcastAlert[] {
  const cutoff = Date.now() - BROADCAST_ALERT_TTL_MS;
  return items.filter((a) => a.receivedAt >= cutoff);
}

function normalizeRow(r: Record<string, unknown>): PersistedBroadcastAlert | null {
  const key = typeof r.key === "string" ? r.key : "";
  const text = typeof r.text === "string" ? r.text : "";
  const variant = r.variant === "vicinity" ? "vicinity" : "broadcast";
  const receivedAt = typeof r.receivedAt === "number" && Number.isFinite(r.receivedAt) ? r.receivedAt : NaN;
  if (!key || !text || !Number.isFinite(receivedAt)) return null;
  const seen = r.seen === true || r.dismissed === true;
  return {
    key,
    text,
    variant,
    receivedAt,
    seen,
    deleted: r.deleted === true,
  };
}

export function loadBroadcastAlerts(): PersistedBroadcastAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: PersistedBroadcastAlert[] = [];
    for (const x of p) {
      if (!isRecord(x)) continue;
      const row = normalizeRow(x);
      if (row) out.push(row);
    }
    return pruneBroadcastAlerts(out);
  } catch {
    return [];
  }
}

export function saveBroadcastAlerts(items: PersistedBroadcastAlert[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pruneBroadcastAlerts(items)));
  } catch {
    /* */
  }
}

/** In-alert stack: not user-deleted, within TTL, newest first (includes Seen for browsing). */
export function filterActiveAlerts(items: PersistedBroadcastAlert[]): PersistedBroadcastAlert[] {
  const pruned = pruneBroadcastAlerts(items);
  return pruned.filter((a) => !a.deleted).sort((a, b) => b.receivedAt - a.receivedAt);
}

/** Floating toast: only items the user has not marked Seen yet. */
export function filterUnseenAlerts(items: PersistedBroadcastAlert[]): PersistedBroadcastAlert[] {
  return filterActiveAlerts(items).filter((a) => !a.seen);
}

/** After Seen: same 24h window, scrollable archive until Delete or TTL. */
export function filterSeenArchive(items: PersistedBroadcastAlert[]): PersistedBroadcastAlert[] {
  return filterActiveAlerts(items).filter((a) => a.seen);
}
