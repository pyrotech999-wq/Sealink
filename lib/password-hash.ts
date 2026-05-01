import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export type PasswordHash = {
  saltHex: string;
  hashHex: string;
};

/** Accept object from KV/JSONB or a JSON string (some stores double-encode). */
export function coercePasswordHash(stored: unknown): PasswordHash | null {
  if (stored && typeof stored === "object") {
    const o = stored as Record<string, unknown>;
    if (typeof o.saltHex === "string" && typeof o.hashHex === "string") {
      return { saltHex: o.saltHex, hashHex: o.hashHex };
    }
    return null;
  }
  if (typeof stored === "string" && stored.length > 0) {
    try {
      return coercePasswordHash(JSON.parse(stored) as unknown);
    } catch {
      return null;
    }
  }
  return null;
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return { saltHex: salt.toString("hex"), hashHex: hash.toString("hex") };
}

export function verifyPassword(password: string, stored: PasswordHash | unknown): boolean {
  const hash = coercePasswordHash(stored);
  if (!hash) return false;
  try {
    const salt = Buffer.from(hash.saltHex, "hex");
    const expected = Buffer.from(hash.hashHex, "hex");
    const got = scryptSync(password, salt, expected.length);
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

