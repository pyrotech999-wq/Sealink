/** When true, anchor command API routes may include `message` + `stack` on errors (never in production unless explicitly enabled). */
export function anchorCommandsExposeServerErrors(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SEALINK_DEBUG_API_ERRORS === "1" ||
    process.env.VERCEL_ENV === "preview"
  );
}
