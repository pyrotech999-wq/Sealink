/**
 * Voucher codes are authorised only on the server via `process.env.VOUCHER_CODES`.
 * Never accept a discount percentage from the client without validating the code here (or in a DB you control).
 */

export type VoucherOk = { ok: true; discountPercent: number };
export type VoucherErr = { ok: false; message: string };
export type VoucherResult = VoucherOk | VoucherErr;

function loadAuthorisedVouchers(): Record<string, number> {
  const raw = process.env.VOUCHER_CODES?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const key = String(k).trim().toUpperCase();
      const n = typeof v === "number" ? v : Number(v);
      if (!key || Number.isNaN(n)) continue;
      const pct = Math.round(n);
      if (pct < 0 || pct > 100) continue;
      out[key] = pct;
    }
    return out;
  } catch {
    return {};
  }
}

export function validateVoucherCode(code: string): VoucherResult {
  const normalised = code.trim().toUpperCase();
  if (!normalised) {
    return { ok: false, message: "Enter a voucher code" };
  }

  const vouchers = loadAuthorisedVouchers();
  if (Object.keys(vouchers).length === 0) {
    return { ok: false, message: "No voucher offers are active" };
  }

  const discountPercent = vouchers[normalised];
  if (discountPercent === undefined) {
    return { ok: false, message: "Invalid or unauthorised code" };
  }

  return { ok: true, discountPercent };
}
