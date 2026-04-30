import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export type PasswordHash = {
  saltHex: string;
  hashHex: string;
};

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return { saltHex: salt.toString("hex"), hashHex: hash.toString("hex") };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  try {
    const salt = Buffer.from(stored.saltHex, "hex");
    const expected = Buffer.from(stored.hashHex, "hex");
    const got = scryptSync(password, salt, expected.length);
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

