export type DemoMeResponse = { signedIn?: boolean; uid?: string; isAdmin?: boolean };

const SESSION_KEY = "sealink_demo_me_v1";

type CacheState = { value: DemoMeResponse; storedAt: number };

let mem: CacheState | null = null;
let inFlight: Promise<DemoMeResponse> | null = null;

function readSession(): CacheState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: unknown; storedAt?: unknown };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.storedAt !== "number") return null;
    if (typeof parsed.value !== "object" || parsed.value === null) return null;
    return { value: parsed.value as DemoMeResponse, storedAt: parsed.storedAt };
  } catch {
    return null;
  }
}

function writeSession(state: CacheState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* */
  }
}

async function fetchDemoMe(): Promise<DemoMeResponse> {
  const r = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) return {};
  try {
    return (await r.json()) as DemoMeResponse;
  } catch {
    return {};
  }
}

/**
 * Session cache + in-flight dedupe for `/api/demo/me` (used as "am I logged in?" probe).
 * Defaults to returning cached value for this tab session.
 */
export function getDemoMe(opts?: { force?: boolean }): Promise<DemoMeResponse> {
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

  inFlight = fetchDemoMe()
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

export function invalidateDemoMeCache() {
  mem = null;
  inFlight = null;
  clearSession();
}

