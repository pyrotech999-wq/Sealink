"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OAuthProviderButtons } from "@/components/OAuthProviderButtons";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";
import { LAST_SIGNIN_EMAIL_STORAGE_KEY, normaliseEmail } from "@/lib/email-normalise";
import { oauthErrorMessage } from "@/lib/oauth-ui-messages";
import { safeInternalPathFromNextParam } from "@/lib/safe-internal-next-path";
import { useRouter } from "next/navigation";
import { invalidateMeSubscriptionCache } from "@/lib/client/me-subscription";
import { invalidateDemoMeCache } from "@/lib/client/demo-me";
import { bindSessionProfileEmailFromServer } from "@/lib/session-profile-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function postSignInRedirectTarget(): string {
  try {
    return safeInternalPathFromNextParam(new URLSearchParams(window.location.search).get("next"));
  } catch {
    return "/";
  }
}

type DeviceRow = { deviceId: string; name: string; activatedAt: string; lastSeenAt: string };

function isDeviceRow(v: unknown): v is DeviceRow {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.deviceId === "string" &&
    typeof o.name === "string" &&
    typeof o.activatedAt === "string" &&
    typeof o.lastSeenAt === "string"
  );
}

/** When fetch() throws before any HTTP response (TLS, DNS, timeout, blocked in-app browser, etc.). */
function signInFetchFailedMessage(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You look offline. Turn on Wi‑Fi or mobile data, then try again.";
  }
  const detail = err instanceof Error ? err.message.trim() : "";
  const devSuffix =
    process.env.NODE_ENV === "development" && detail ? ` Technical detail: ${detail}` : "";
  return (
    "The sign-in request never reached the server (or the connection dropped). Try: Wi‑Fi instead of weak mobile data; " +
    "open https://sealinkapp.com in Safari or Chrome (not inside Facebook/Instagram’s in-app browser); pause VPN or ad blockers; " +
    "confirm the home page loads. Then try again." +
    devSuffix
  );
}

async function startDemoSession(
  email: string,
  password: string,
  opts?: { deactivateDeviceId?: string; rememberMe?: boolean; redirect?: boolean },
): Promise<
  | { ok: true }
  | { ok: false; message: string; devices?: { deviceId: string; name: string; activatedAt: string; lastSeenAt: string }[] }
> {
  const shouldRedirect = opts?.redirect ?? !opts?.deactivateDeviceId;
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceName = getDeviceName();
    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        deviceId,
        deviceName,
        deactivateDeviceId: opts?.deactivateDeviceId,
        rememberMe: opts?.rememberMe ?? true,
      }),
    });
    if (!res.ok) {
      let message = "Could not start session. Try again.";
      let devices: { deviceId: string; name: string; activatedAt: string; lastSeenAt: string }[] | undefined;
      try {
        const ct = res.headers.get("content-type");
        if (ct?.includes("application/json")) {
          const data = (await res.json()) as { error?: string; devices?: unknown };
          message = data.error || message;
          devices = Array.isArray(data.devices) ? data.devices.filter(isDeviceRow) : undefined;
        } else {
          message = `Sign-in failed (${res.status}). Try again in a moment.`;
        }
      } catch {
        message = `Sign-in failed (${res.status}). Try again in a moment.`;
      }
      return { ok: false, message, devices };
    }
    if (opts?.deactivateDeviceId) {
      return { ok: true };
    }

    if (shouldRedirect) {
      async function readSignedIn(): Promise<boolean> {
        try {
          const r = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
          const ct = r.headers.get("content-type");
          if (!ct?.includes("application/json")) return false;
          const j = (await r.json()) as { signedIn?: boolean };
          return j.signedIn === true;
        } catch {
          return false;
        }
      }
      /** Mobile / slow devices sometimes apply Set-Cookie a beat after the JSON response — poll briefly. */
      let okCookie = await readSignedIn();
      for (let i = 0; !okCookie && i < 8; i++) {
        await new Promise((r) => setTimeout(r, 80 + i * 40));
        okCookie = await readSignedIn();
      }
      if (!okCookie) {
        return {
          ok: false,
          message:
            "Your details were accepted, but this browser did not keep the sign-in cookie. On a phone testing dev, open the same machine using http://YOUR-PC-IP:3000 (run npm run dev:lan) and leave COOKIE_DOMAIN unset in .env.local. Also try turning off strict tracking prevention, avoid private mode, and on production ensure COOKIE_DOMAIN is only the bare hostname (e.g. sealinkapp.com).",
        };
      }
      try {
        localStorage.setItem(LAST_SIGNIN_EMAIL_STORAGE_KEY, normaliseEmail(email));
      } catch {
        /* */
      }
      bindSessionProfileEmailFromServer(email);
      invalidateMeSubscriptionCache();
      invalidateDemoMeCache();
      window.location.assign(postSignInRedirectTarget());
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: signInFetchFailedMessage(e) };
  }
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [deviceLimit, setDeviceLimit] = useState<
    { deviceId: string; name: string; activatedAt: string; lastSeenAt: string }[]
  >([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST_SIGNIN_EMAIL_STORAGE_KEY);
      if (v && EMAIL_RE.test(v)) setEmail(normaliseEmail(v));
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const o = oauthErrorMessage(p.get("oauth_err"));
      if (o) {
        setError(o);
        p.delete("oauth_err");
        const qs = p.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    } catch {
      /* */
    }
  }, []);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter email and password");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!agree) {
      setError("Tick the box to confirm you agree to the terms and privacy policy.");
      return;
    }
    setError("");
    setDeviceLimit([]);
    setPending(true);
    const result = await startDemoSession(trimmed, password, { rememberMe });
    if (!result.ok) {
      setError(result.message);
      setDeviceLimit(Array.isArray(result.devices) ? result.devices : []);
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      autoComplete="on"
      className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="mb-6">
        <OAuthProviderButtons emphasizeGoogle />
      </div>

      {deviceLimit.length ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Active devices</p>
          <p className="mt-1 text-xs opacity-80">
            You’re already signed in on 2 devices. Deactivate one to sign in here.
          </p>
          <div className="mt-2 space-y-2">
            {deviceLimit.map((d) => (
              <div key={d.deviceId} className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-2 py-1 dark:bg-zinc-950/30">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">
                    {(d.name || "This device").trim() || "This device"}
                  </p>
                  <p className="truncate text-[11px] opacity-70">
                    last seen {new Date(d.lastSeenAt).toLocaleString("en-GB")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const trimmed = email.trim();
                    if (!EMAIL_RE.test(trimmed)) {
                      setError("Enter your email above first.");
                      return;
                    }
                    setPending(true);
                    void (async () => {
                      const res = await startDemoSession(trimmed, password, {
                        deactivateDeviceId: d.deviceId,
                        rememberMe,
                        redirect: false,
                      });
                      if (!res.ok) {
                        setError(res.message);
                        setPending(false);
                        return;
                      }
                      // After deactivating, try sign-in again.
                      const res2 = await startDemoSession(trimmed, password, { rememberMe });
                      if (!res2.ok) {
                        setError(res2.message);
                        setDeviceLimit(Array.isArray(res2.devices) ? res2.devices : []);
                        setPending(false);
                      }
                    })();
                  }}
                  className="shrink-0 rounded-md bg-amber-700 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Email address
          </label>
          <input
            id="signin-email"
            name="username"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="signin-password" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Password
            </label>
            <button
              type="button"
              className="text-xs font-medium text-green-800 hover:underline dark:text-green-400"
              onClick={() => router.push(`/forgot-password?email=${encodeURIComponent(email.trim())}`)}
            >
              Forgotten password?
            </button>
          </div>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">Keep me signed in</span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Longer-lived session cookie (still sign out anytime). Your email is saved on this device after a successful
              sign-in; passwords are never stored here — use your browser or phone password manager to save the password
              if you want.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
              privacy policy
            </Link>
            .
          </span>
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "Opening app…" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        You need an account to use SeaLink. Create one from the link below if you are new.
      </p>
    </form>
  );
}
