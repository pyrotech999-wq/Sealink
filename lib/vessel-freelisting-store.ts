import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as fb from "@/lib/vessel-freelisting-supabase";

const DATA_PATH = path.join(process.cwd(), "data", "vessel-freelist.json");

type JsonCode = {
  id: string;
  codeNorm: string;
  label: string | null;
  maxUses: number;
  uses: number;
  slotsPerRedeem: number;
  expiresAt: string | null;
  createdAt: string;
};

type JsonState = {
  balances: Record<string, number>;
  codes: JsonCode[];
  redemptions: { promoId: string; userUid: string; at: string }[];
};

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function readJson(): JsonState {
  try {
    if (!existsSync(DATA_PATH)) return { balances: {}, codes: [], redemptions: [] };
    const raw = readFileSync(DATA_PATH, "utf-8");
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return { balances: {}, codes: [], redemptions: [] };
    const o = p as Partial<JsonState>;
    return {
      balances: typeof o.balances === "object" && o.balances !== null ? (o.balances as Record<string, number>) : {},
      codes: Array.isArray(o.codes) ? (o.codes as JsonCode[]) : [],
      redemptions: Array.isArray(o.redemptions) ? (o.redemptions as { promoId: string; userUid: string; at: string }[]) : [],
    };
  } catch {
    return { balances: {}, codes: [], redemptions: [] };
  }
}

function writeJson(s: JsonState): void {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(s, null, 2), "utf-8");
}

export function normalisePromoCodeInput(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function getSlotBalance(userUid: string): Promise<number> {
  if (isSupabaseConfigured()) return fb.getSlotBalanceSupabase(userUid);
  return enqueue(async () => {
    const s = readJson();
    return Math.max(0, Math.floor(s.balances[userUid] ?? 0));
  });
}

export async function consumeOneSlot(userUid: string): Promise<boolean> {
  if (isSupabaseConfigured()) return fb.consumeOneSlotSupabase(userUid);
  return enqueue(async () => {
    const s = readJson();
    const n = Math.max(0, Math.floor(s.balances[userUid] ?? 0));
    if (n < 1) return false;
    s.balances[userUid] = n - 1;
    writeJson(s);
    return true;
  });
}

export async function redeemPromo(
  userUid: string,
  code: string,
): Promise<{ ok: true; slotsAdded: number } | { ok: false; error: string }> {
  const codeNorm = normalisePromoCodeInput(code);
  if (codeNorm.length < 4) return { ok: false, error: "Enter a valid code" };

  if (isSupabaseConfigured()) return fb.redeemPromoSupabase(codeNorm, userUid);

  return enqueue(async () => {
    const s = readJson();
    const now = Date.now();
    const promo = s.codes.find((c) => c.codeNorm === codeNorm);
    if (!promo) return { ok: false, error: "Invalid or expired code" };
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= now) return { ok: false, error: "Invalid or expired code" };
    if (promo.uses >= promo.maxUses) return { ok: false, error: "This code has no uses left" };
    if (s.redemptions.some((r) => r.promoId === promo.id && r.userUid === userUid)) {
      return { ok: false, error: "You have already redeemed this code" };
    }
    promo.uses += 1;
    s.redemptions.push({ promoId: promo.id, userUid, at: new Date().toISOString() });
    const prev = Math.max(0, Math.floor(s.balances[userUid] ?? 0));
    s.balances[userUid] = prev + promo.slotsPerRedeem;
    writeJson(s);
    return { ok: true, slotsAdded: promo.slotsPerRedeem };
  });
}

export async function adminListPromoCodes(): Promise<fb.PromoCodeRow[]> {
  if (isSupabaseConfigured()) return fb.listPromoCodesSupabase();
  return enqueue(async () => {
    const s = readJson();
    return s.codes.map((c) => ({
      id: c.id,
      codeNorm: c.codeNorm,
      label: c.label,
      maxUses: c.maxUses,
      uses: c.uses,
      slotsPerRedeem: c.slotsPerRedeem,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
  });
}

export async function adminCreatePromoCode(input: {
  code: string;
  label?: string | null;
  maxUses: number;
  slotsPerRedeem: number;
  expiresAt?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const codeNorm = normalisePromoCodeInput(input.code);
  if (codeNorm.length < 4) return { ok: false, error: "Code must be at least 4 characters" };
  const maxUses = Math.max(1, Math.min(100_000, Math.floor(input.maxUses)));
  const slotsPerRedeem = Math.max(1, Math.min(50, Math.floor(input.slotsPerRedeem)));

  if (isSupabaseConfigured()) {
    return fb.insertPromoCodeSupabase({
      codeNorm,
      label: input.label?.trim() ? input.label.trim().slice(0, 120) : null,
      maxUses,
      slotsPerRedeem,
      expiresAt: input.expiresAt?.trim() ? input.expiresAt.trim() : null,
    });
  }

  return enqueue(async () => {
    const s = readJson();
    if (s.codes.some((c) => c.codeNorm === codeNorm)) return { ok: false, error: "That code already exists" };
    const id = randomUUID();
    s.codes.push({
      id,
      codeNorm,
      label: input.label?.trim() ? input.label.trim().slice(0, 120) : null,
      maxUses,
      uses: 0,
      slotsPerRedeem,
      expiresAt: input.expiresAt?.trim() ? input.expiresAt.trim() : null,
      createdAt: new Date().toISOString(),
    });
    writeJson(s);
    return { ok: true, id };
  });
}
