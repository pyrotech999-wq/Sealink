export type MeSubscriptionResponse = {
  ok?: boolean;
  hasAccess?: boolean;
  isAdmin?: boolean;
  source?: "reserved" | "admin_grant" | "paypal" | "stripe" | "none";
};

const SESSION_KEY = "sealink_me_subscription_v1";

type CacheState = { value: MeSubscriptionResponse; storedAt: number };

let mem: CacheState | null = null;
let inFlight: Promise<MeSubscriptionResponse> | null = null;

function readSession(): CacheState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: unknown; storedAt?: unknown };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.storedAt !== "number") return null;
    if (typeof parsed.value !== "object" || parsed.value === null) return null;
    return { value: parsed.value as MeSubscriptionResponse, storedAt: parsed.storedAt };
  } catch {
    return null;
  }
}

function writeSession(state: CacheState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* private mode etc. */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* */
  }
}

async function fetchMeSubscription(): Promise<MeSubscriptionResponse> {
  const res = await fetch("/api/me/subscription", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return {};
  try {
    return (await res.json()) as MeSubscriptionResponse;
  } catch {
    return {};
  }
}

/**
 * Session cache + in-flight request dedupe for `/api/me/subscription`.
 *
 * - Returns cached value for the current tab session when available.
 * - Deduplicates concurrent calls (React strict mode, multi-component load, etc.).
 * - Pass `force: true` to bypass cache (manual refresh).
 */
export function getMeSubscription(opts?: { force?: boolean }): Promise<MeSubscriptionResponse> {
  const force = opts?.force === true;
  if (!force) {
    if (mem) return Promise.resolve(mem.value);
    const fromSession = readSession();
    if (fromSession) {
      mem = fromSession;
      return Promise.resolve(fromSession.value);
    }
    if (inFlight) return inFlight;
  }

  inFlight = fetchMeSubscription()
    .then((value) => {
      const next: CacheState = { value, storedAt: Date.now() };
      mem = next;
      writeSession(next);
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Clears cached subscription status; next `getMeSubscription()` will refetch. */
export function invalidateMeSubscriptionCache() {
  mem = null;
  inFlight = null;
  clearSession();
}

/** Convenience for a manual "refresh subscription status" action. */
export function refreshMeSubscription() {
  return getMeSubscription({ force: true });
}

