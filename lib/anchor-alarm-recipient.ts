const PRESENTED_ID_SESSION_KEY = "sealink_anchor_alert_presented_id_v1";

/**
 * Whether this device should show the full-screen anchor alarm / notifications for a server inbox alert.
 * Empty `alertDeviceIds` means all signed-in devices (same as `HomeLocationMap` inbox poll).
 */
export function shouldReceiveAnchorAlarmPopUp(alertDeviceIds: string[] | null | undefined, thisDeviceId: string): boolean {
  if (!alertDeviceIds?.length) return true;
  return alertDeviceIds.includes(thisDeviceId);
}

export function readPresentedAnchorAlertId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(PRESENTED_ID_SESSION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function writePresentedAnchorAlertId(id: string): void {
  if (typeof window === "undefined" || !id.trim()) return;
  try {
    sessionStorage.setItem(PRESENTED_ID_SESSION_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

export function clearPresentedAnchorAlertId(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PRESENTED_ID_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
