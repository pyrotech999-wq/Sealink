"use client";

import { useEffect, useState } from "react";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";

type OauthConfig = { enabled?: boolean; google?: boolean; facebook?: boolean; apple?: boolean };

function buildStartUrl(provider: "google" | "facebook" | "apple"): string {
  const deviceId = encodeURIComponent(getOrCreateDeviceId());
  const deviceName = encodeURIComponent(getDeviceName());
  return `/api/auth/oauth/${provider}?deviceId=${deviceId}&deviceName=${deviceName}`;
}

const btnBase =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

type OAuthProviderButtonsProps = {
  /** Extra line under buttons (e.g. sign-up: explains skipping the wizard). Only shown when OAuth is enabled. */
  signUpCaption?: boolean;
};

export function OAuthProviderButtons({ signUpCaption }: OAuthProviderButtonsProps) {
  const [cfg, setCfg] = useState<OauthConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/oauth/config", { cache: "no-store" })
      .then((r) => r.json() as Promise<OauthConfig>)
      .then((d) => {
        if (!cancelled) setCfg(d);
      })
      .catch(() => {
        if (!cancelled) setCfg({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cfg?.enabled) return null;

  return (
    <div className="space-y-2">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">Or continue with</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        {cfg.google ? (
          <a
            className={`${btnBase} sm:min-w-[140px] sm:flex-1`}
            href={buildStartUrl("google")}
            aria-label="Continue with Google"
          >
            Google
          </a>
        ) : null}
        {cfg.apple ? (
          <a
            className={`${btnBase} sm:min-w-[140px] sm:flex-1`}
            href={buildStartUrl("apple")}
            aria-label="Continue with Apple"
          >
            Apple
          </a>
        ) : null}
        {cfg.facebook ? (
          <a
            className={`${btnBase} sm:min-w-[140px] sm:flex-1`}
            href={buildStartUrl("facebook")}
            aria-label="Continue with Facebook"
          >
            Facebook
          </a>
        ) : null}
      </div>
      {signUpCaption ? (
        <p className="mt-3 text-center text-xs text-zinc-500">
          Tap a provider to sign in with that account — you skip the steps below. Otherwise continue with the form.
        </p>
      ) : null}
    </div>
  );
}
