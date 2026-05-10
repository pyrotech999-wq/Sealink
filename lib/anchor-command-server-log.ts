/**
 * Server-side anchor session command lifecycle logging (creation, receipt, apply, failures).
 */
export function anchorCommandServerLog(phase: string, detail: Record<string, unknown>): void {
  try {
    console.info("[anchor-session-command]", phase, JSON.stringify(detail));
  } catch {
    /* ignore */
  }
}
