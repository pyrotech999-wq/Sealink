export const TRIAL_DAYS = 14;
export const MONTHLY_GBP = 5;
export const YEARLY_GBP = 25;

export type BillingPlan = "monthly" | "yearly";

export function recurringPriceGbp(plan: BillingPlan): number {
  return plan === "monthly" ? MONTHLY_GBP : YEARLY_GBP;
}

/** Applies percentage discount (0–100) after trial; 100% => £0 recurring. */
export function discountedRecurringGbp(plan: BillingPlan, discountPercent: number): number {
  const base = recurringPriceGbp(plan);
  const pct = Math.min(100, Math.max(0, discountPercent));
  const factor = 1 - pct / 100;
  return Math.round(base * factor * 100) / 100;
}
