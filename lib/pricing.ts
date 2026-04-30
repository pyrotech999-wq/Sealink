export const TRIAL_DAYS = 14;
export const MONTHLY_GBP = 3.49;
/** Display price for the annual billing option (must match your Stripe annual Price). */
export const ANNUAL_GBP = 25;

export type BillingPlan = "monthly" | "annual";

export function recurringPriceGbp(plan: BillingPlan): number {
  return plan === "monthly" ? MONTHLY_GBP : ANNUAL_GBP;
}

/** Applies percentage discount (0–100) after trial; 100% => £0 recurring. */
export function discountedRecurringGbp(plan: BillingPlan, discountPercent: number): number {
  const base = recurringPriceGbp(plan);
  const pct = Math.min(100, Math.max(0, discountPercent));
  const factor = 1 - pct / 100;
  return Math.round(base * factor * 100) / 100;
}
