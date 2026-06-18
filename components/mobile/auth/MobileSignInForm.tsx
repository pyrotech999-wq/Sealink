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
import { Mail, Lock, Shield, ArrowRight } from "lucide-react";

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

export default function MobileSignInForm() {
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
      className="w-full bg-gradient-to-br from-[#0c1a30]/90 to-[#061020]/95 border border-white/[0.08] p-6 rounded-[28px] backdrop-blur-xl shadow-2xl space-y-5"
    >
      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/15 p-3 text-center text-xs text-red-400">
          {error}
        </p>
      )}

      {/* OAuth Integration - Custom styled wrap */}
      <div>
        <OAuthProviderButtons emphasizeGoogle />
      </div>

      {/* Device Limit Section */}
      {deviceLimit.length ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3 shadow-inner">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Active Device Limit</p>
          <p className="text-[11px] text-slate-300 leading-tight">
            You are signed in on 2 other devices. Deactivate one below to continue.
          </p>
          <div className="space-y-2">
            {deviceLimit.map((d) => (
              <div key={d.deviceId} className="flex items-center justify-between gap-3 rounded-xl bg-black/35 border border-white/[0.04] p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
                    {(d.name || "This device").trim() || "This device"}
                  </p>
                  <p className="truncate text-[10px] text-slate-400 mt-0.5">
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
                      const res2 = await startDemoSession(trimmed, password, { rememberMe });
                      if (!res2.ok) {
                        setError(res2.message);
                        setDeviceLimit(Array.isArray(res2.devices) ? res2.devices : []);
                        setPending(false);
                      }
                    })();
                  }}
                  className="shrink-0 h-8 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-500 active:scale-95 transition-all"
                >
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Input Credentials */}
      <div className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1">
            Email Address
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
              <Mail size={15} />
            </span>
            <input
              id="signin-email"
              name="username"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] pl-10 pr-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
              placeholder="e.g. helm@sealink.com"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
            <label htmlFor="signin-password" className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
              Password
            </label>
            <button
              type="button"
              className="text-[11px] font-bold text-cyan-400 hover:underline"
              onClick={() => router.push(`/forgot-password?email=${encodeURIComponent(email.trim())}`)}
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
              <Lock size={15} />
            </span>
            <input
              id="signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] pl-10 pr-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
              placeholder="••••••••••••"
            />
          </div>
        </div>

        {/* Keep signed in */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/15 p-4 transition-all">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="mt-0.5 size-4 rounded border-white/20 bg-slate-900 text-cyan-600 focus:ring-cyan-600"
          />
          <div>
            <span className="text-xs font-bold text-slate-200 block">Keep me signed in</span>
            <span className="mt-1 block text-[10px] text-slate-400 leading-normal">
              Saves your session cookie so you do not need to sign in every time. Your password is never stored on the device.
            </span>
          </div>
        </label>

        {/* Safety Disclaimer */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-amber-400" />
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Safety Disclaimer</p>
          </div>
          <p className="text-[10px] leading-normal text-slate-300">
            SeaLink telemetry, weather, and alerts are for informational purposes only. Do not rely on SeaLink for safety, emergency response, passage routing, or anchoring decisions.
          </p>
        </div>

        {/* Accept terms */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/15 p-4 transition-all">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 size-4 rounded border-white/20 bg-slate-900 text-cyan-600 focus:ring-cyan-600"
          />
          <span className="text-xs text-slate-300">
            I agree to the{" "}
            <Link href="/terms" className="font-bold text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
              terms and conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
              privacy policy
            </Link>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>{pending ? "Opening App..." : "Sign In to Console"}</span>
        <ArrowRight size={14} />
      </button>
    </form>
  );
}
