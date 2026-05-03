"use client";

import { useEffect, useState } from "react";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";

type OauthConfig = {
  enabled?: boolean;
  google?: boolean;
  facebook?: boolean;
  apple?: boolean;
  googleCredentialsSet?: boolean;
  pkceConfigured?: boolean;
};

function buildStartUrl(provider: "google" | "facebook" | "apple"): string {
  const deviceId = encodeURIComponent(getOrCreateDeviceId());
  const deviceName = encodeURIComponent(getDeviceName());
  return `/api/auth/oauth/${provider}?deviceId=${deviceId}&deviceName=${deviceName}`;
}

const btnNeutral =
  "inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

const btnGoogle =
  "inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

type OAuthProviderButtonsProps = {
  /** Extra line under buttons (e.g. sign-up: explains skipping the wizard). Only shown when OAuth is enabled. */
  signUpCaption?: boolean;
  /** Larger Google-first row + “or” divider for sign-in / sign-up pages. */
  emphasizeGoogle?: boolean;
};

export function OAuthProviderButtons({ signUpCaption, emphasizeGoogle }: OAuthProviderButtonsProps) {
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

  if (cfg === null) return null;

  const hasAny = Boolean(cfg.enabled && (cfg.google || cfg.facebook || cfg.apple));
  const googleMisconfigured =
    Boolean(cfg.googleCredentialsSet) && cfg.pkceConfigured === false && process.env.NODE_ENV === "development";

  if (!hasAny) {
    if (googleMisconfigured) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Google client env vars are set, but <span className="font-mono">OAUTH_PKCE_SECRET</span> is missing or too short
          (min 16 chars). Add it to enable Continue with Google. See <span className="font-mono">.env.example</span>.
        </p>
      );
    }
    return null;
  }

  const otherProviders = (
    <>
      {cfg.apple ? (
        <a
          className={`${btnNeutral} sm:min-w-[140px] sm:flex-1`}
          href={buildStartUrl("apple")}
          aria-label="Continue with Apple"
        >
          Apple
        </a>
      ) : null}
      {cfg.facebook ? (
        <a
          className={`${btnNeutral} sm:min-w-[140px] sm:flex-1`}
          href={buildStartUrl("facebook")}
          aria-label="Continue with Facebook"
        >
          Facebook
        </a>
      ) : null}
    </>
  );

  if (emphasizeGoogle && cfg.google) {
    return (
      <div className="space-y-3">
        <a className={btnGoogle} href={buildStartUrl("google")} aria-label="Continue with Google">
          <GoogleMark className="size-5 shrink-0" />
          Continue with Google
        </a>
        {(cfg.apple || cfg.facebook) ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">{otherProviders}</div>
        ) : null}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
          </div>
          <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
            <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-950">Or</span>
          </div>
        </div>
        {signUpCaption ? (
          <p className="text-center text-xs text-zinc-500">
            With Google or Apple you skip the steps below. Otherwise continue with the form.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">Or continue with</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        {cfg.google ? (
          <a
            className={`${btnNeutral} sm:min-w-[160px] sm:flex-1`}
            href={buildStartUrl("google")}
            aria-label="Continue with Google"
          >
            <GoogleMark className="size-5 shrink-0" />
            Google
          </a>
        ) : null}
        {cfg.apple ? (
          <a
            className={`${btnNeutral} sm:min-w-[140px] sm:flex-1`}
            href={buildStartUrl("apple")}
            aria-label="Continue with Apple"
          >
            Apple
          </a>
        ) : null}
        {cfg.facebook ? (
          <a
            className={`${btnNeutral} sm:min-w-[140px] sm:flex-1`}
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
