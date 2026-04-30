/** Shared by client and server — keep free of `next/headers` so client bundles stay safe. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** localStorage: last email used for sign-in / sign-up on this browser (not a secret). */
export const LAST_SIGNIN_EMAIL_STORAGE_KEY = "sealink_last_email_v1";
