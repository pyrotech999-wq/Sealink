/**
 * Structured logging for outbound Stormglass HTTP calls (no API key in URLs).
 */

export function stormglassUrlForLog(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`;
}

export function logStormglassRequest(file: string, fn: string, url: URL): void {
  const ts = new Date().toISOString();
  console.info(`[Stormglass][REQ] ${ts} ${file} ${fn} ${stormglassUrlForLog(url)}`);
}
