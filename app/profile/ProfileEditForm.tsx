"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { MobileProfile } from "@/components/mobile/profile/MobileProfile";
import {
  compressProfilePhoto,
  PROFILE_PHOTO_LOCAL_STORAGE_MAX_BYTES,
  PROFILE_PHOTO_MAX_BYTES,
} from "@/lib/client/compress-profile-photo";
import {
  getAvatarDataUrl, getBoatName, getFullName, getProfilePhone,
  getShowAvatar, setAvatarDataUrl, setBoatName, setFullName,
  setProfilePhone, setShowAvatar,
} from "@/lib/map-profile-storage";
import { validateProfileDisplayName } from "@/lib/profile-display-name";
import { normalisePhone } from "@/lib/phone-normalise";

const MAX_RAW_PHOTO_BYTES = 40 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_CHARS = 430_000;

type Props = { signedIn: boolean; accountEmail: string; nameRequired?: boolean };

async function shrinkAvatarDataUrlForStorage(dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_AVATAR_DATA_URL_CHARS) return trimmed;
  const res = await fetch(trimmed);
  const blob = await res.blob();
  const file = new File([blob], "profile.jpg", {
    type: blob.type?.startsWith("image/") ? blob.type : "image/jpeg",
  });
  const small = await compressProfilePhoto(file, { maxBytes: PROFILE_PHOTO_LOCAL_STORAGE_MAX_BYTES });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not process photo. Try a smaller image."));
    reader.readAsDataURL(small);
  });
}

export function ProfileEditForm({ signedIn, accountEmail, nameRequired = false }: Props) {
  const router = useRouter();
  const { mounted, isMobile } = useIsMobileApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [fullName, setFullNameState] = useState("");
  const [boatName, setBoatNameState] = useState("");
  const [phone, setPhoneState] = useState("");
  const [showAvatar, setShowAvatarState] = useState(true);
  const [avatarDataUrl, setAvatarDataUrlState] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoWorking, setPhotoWorking] = useState(false);
  const [serverSync, setServerSync] = useState(false);

  // ── Shared effects ────────────────────────────────────────────────────────
  useEffect(() => {
    queueMicrotask(() => {
      setFullNameState(getFullName());
      setBoatNameState(getBoatName());
      setPhoneState(getProfilePhone());
      setShowAvatarState(getShowAvatar());
      setAvatarDataUrlState(getAvatarDataUrl());
    });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/profiles/me", { credentials: "same-origin", cache: "no-store" });
        const d = await r.json() as {
          supabase?: boolean; fullName?: string | null;
          boatName?: string | null; phone?: string | null; avatarPublicUrl?: string | null;
        };
        if (cancelled || !r.ok) return;
        setServerSync(d.supabase === true);
        if (d.supabase === false) return;
        if (typeof d.fullName === "string" && d.fullName.trim()) setFullNameState(d.fullName.trim());
        if (typeof d.boatName === "string") setBoatNameState(d.boatName.trim());
        if (typeof d.phone === "string" && d.phone.trim()) setPhoneState(d.phone.trim());
      } catch { /* keep localStorage values */ }
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  useEffect(() => {
    if (!error) return;
    const id = requestAnimationFrame(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [error]);

  // ── Shared handlers ───────────────────────────────────────────────────────
  async function onPickPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file (JPEG, PNG, or WebP)."); return; }
    if (file.size > MAX_RAW_PHOTO_BYTES) { setError("File too large (40 MB max). Try a smaller original."); return; }
    setError("");
    setPhotoWorking(true);
    try {
      const processed = await compressProfilePhoto(file);
      if (processed.size > PROFILE_PHOTO_MAX_BYTES) { setError("Could not shrink that photo enough. Try a different image."); return; }
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { try { setAvatarDataUrlState(String(reader.result || "")); resolve(); } catch { reject(new Error("read")); } };
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(processed);
      });
    } catch { setError("Could not process that image. Try another file."); }
    finally { setPhotoWorking(false); }
  }

  function removePhoto() {
    setAvatarDataUrlState("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSave(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    const nameTrim = fullName.trim();
    const nameErr = validateProfileDisplayName(nameTrim);
    if (nameErr) { setError(nameErr); return; }
    setSaving(true);
    try {
      const nextAvatar = await shrinkAvatarDataUrlForStorage(avatarDataUrl);
      if (nextAvatar !== avatarDataUrl) setAvatarDataUrlState(nextAvatar);
      if (signedIn && serverSync) {
        const r = await fetch("/api/profiles/me", {
          method: "PATCH", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: nameTrim, boatName: boatName.trim(), phone: normalisePhone(phone), avatarDataUrl: nextAvatar.trim() ? nextAvatar : null }),
        });
        const d = await r.json() as { ok?: boolean; error?: string };
        if (!r.ok) { setError(typeof d.error === "string" ? d.error : "Could not save profile to your account."); return; }
      }
      setBoatName(boatName);
      setFullName(nameTrim);
      setProfilePhone(normalisePhone(phone));
      if (nextAvatar) setAvatarDataUrl(nextAvatar); else setAvatarDataUrl(null);
      setShowAvatar(showAvatar);
      router.push("/");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    finally { setSaving(false); }
  }

  // ── Hidden file input (shared between both UIs) ───────────────────────────
  const sharedFileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      disabled={photoWorking}
      onChange={(e) => void onPickPhoto(e)}
    />
  );

  // ── Error block (shared) ──────────────────────────────────────────────────
  const errorBlock = error ? (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
      {error}
    </p>
  ) : null;

  // ── Avoid hydration mismatch: render nothing until mounted ────────────────
  if (!mounted) return null;

  // =========================================================================
  // MOBILE APP UI  (Capacitor / small screen)
  // =========================================================================
  // =========================================================================
  // MOBILE APP UI  (Capacitor / small screen)
  // =========================================================================
  if (isMobile) {
    return <MobileProfile signedIn={signedIn} accountEmail={accountEmail} nameRequired={nameRequired} />;
  }

  // =========================================================================
  // WEB UI  (unchanged from your original)
  // =========================================================================
  return (
    <form
      onSubmit={onSave}
      className="mt-8 space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
    >
      {sharedFileInput}

      {signedIn && accountEmail ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">Account</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{accountEmail}</span>
          </p>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            To change your password, use{" "}
            <Link href={`/forgot-password?email=${encodeURIComponent(accountEmail)}`}
              className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
              forgotten password
            </Link>.
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/sign-in" className="font-medium text-green-800 hover:underline dark:text-green-400">Sign in</Link>{" "}
          to tie posting and adverts to your email. You can still update how you appear on the map below.
        </p>
      )}

      <div>
        <label htmlFor="profile-full" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Your name <span className="font-normal text-red-600 dark:text-red-400">(required)</span>
        </label>
        <input id="profile-full" required minLength={2} maxLength={120} autoComplete="name"
          value={fullName} onChange={(e) => setFullNameState(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {signedIn && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Shown to others in area-broadcast replies and private messages (not your account id).</p>}
      </div>

      <div>
        <label htmlFor="profile-boat" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Boat name</label>
        <input id="profile-boat" value={boatName} onChange={(e) => setBoatNameState(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <label htmlFor="profile-phone" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone <span className="font-normal text-zinc-500">(international, e.g. +447700900123)</span>
        </label>
        <input id="profile-phone" type="tel" autoComplete="tel" inputMode="tel"
          value={phone} onChange={(e) => setPhoneState(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Profile photo</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Shown on your map pin when enabled below. Large photos are resized automatically.
        </p>
        <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900">
            {avatarDataUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarDataUrl} alt="" className="size-full object-cover" />
              : <span className="flex size-full items-center justify-center text-xs text-zinc-400">No photo</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={photoWorking} onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60">
              {photoWorking ? "Resizing…" : "Change photo"}
            </button>
            {avatarDataUrl && (
              <button type="button" onClick={removePhoto}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <input type="checkbox" checked={showAvatar} onChange={(e) => setShowAvatarState(e.target.checked)}
          className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Show profile photo on map pin (when a photo is saved)</span>
      </label>

      <div ref={statusRef} className="space-y-3">{errorBlock}</div>

      <button type="submit" disabled={saving || photoWorking}
        className="flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[140px]">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

// Small helper — iOS-style row used only in mobile UI
function MobileField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center bg-white px-4 dark:bg-zinc-950">
      <span className="w-28 shrink-0 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </div>
  );
}