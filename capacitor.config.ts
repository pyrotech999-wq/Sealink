import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(): void {
  const root = resolve(__dirname);
  for (const name of [".env", ".env.local"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFile();

const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
const fallback = process.env.NEXT_PUBLIC_APP_URL?.trim();
const serverUrl = (explicit || fallback)?.replace(/\/+$/, "") ?? "";

const config: CapacitorConfig = {
  appId: "com.SeaLink",
  appName: "SeaLink",
  webDir: "public",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
