/**
 * Persist a concrete monitoring device id on the server. UI may send `"this"`; the caller’s
 * handset id from `x-sealink-device-id` disambiguates it for command polling / effective monitor.
 */
export function resolveThisMonitorDeviceIdForServerPersist(
  monitorDeviceId: string | undefined,
  headerDeviceId: string,
): string | undefined {
  if (monitorDeviceId === undefined) return undefined;
  const t = monitorDeviceId.trim();
  if (!t || t === "this") {
    if (headerDeviceId && headerDeviceId !== "server") return headerDeviceId;
    return "this";
  }
  return t;
}
