/**
 * Public operator email for data-deletion pages and app-store listings.
 * Kept in a tiny module so static routes do not import Supabase-backed admin helpers.
 * Must match {@link RESERVED_OWNER_EMAIL} in `lib/reserved-admin.ts`.
 */
export const OPERATOR_PUBLIC_EMAIL = "pyrotech999@hotmail.co.uk";
