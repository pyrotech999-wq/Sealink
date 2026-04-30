export const DEVICE_ID_KEY = "sealink_device_id_v1";
export const DEVICE_NAME_KEY = "sealink_device_name_v1";

function uuid(): string {
  // browser-safe fallback; crypto.randomUUID exists on modern browsers
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as Crypto).randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = uuid();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEVICE_NAME_KEY)?.trim() ?? "";
}

export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  const n = name.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  if (!n) localStorage.removeItem(DEVICE_NAME_KEY);
  else localStorage.setItem(DEVICE_NAME_KEY, n);
}

