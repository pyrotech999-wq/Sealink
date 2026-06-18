"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
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

type Props = { signedIn: boolean; accountEmail: string };

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

export function ProfileEditForm({ signedIn, accountEmail }: Props) {
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
    // Derive initials for avatar fallback
    const nameParts = fullName.trim().split(" ").filter(Boolean);
    const initials = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : fullName.slice(0, 2).toUpperCase() || "?";

    return (
      <form onSubmit={onSave} className="flex flex-col bg-zinc-100 dark:bg-zinc-950 min-h-screen safe-top safe-bottom pb-8">
        {sharedFileInput}

        {/* Nav bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/" className="text-[15px] text-green-700 dark:text-green-400">Cancel</Link>
          <span className="text-[16px] font-medium text-zinc-900 dark:text-zinc-50">Edit Profile</span>
          <button type="submit" disabled={saving || photoWorking}
            className="text-[15px] font-medium text-green-700 dark:text-green-400 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Avatar hero */}
        <div className="flex flex-col items-center gap-2.5 py-7 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <button
              type="button"
              disabled={photoWorking}
              onClick={() => fileRef.current?.click()}
              className="relative size-[88px] rounded-full overflow-hidden bg-gradient-to-br from-green-500 to-green-800 active:opacity-75"
            >
              {avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarDataUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-[28px] font-medium text-white">
                  {initials}
                </span>
              )}
            </button>
            {/* Edit badge */}
            <button
              type="button"
              disabled={photoWorking}
              onClick={() => fileRef.current?.click()}
              aria-label="Change photo"
              className="absolute bottom-0.5 right-0.5 size-[26px] rounded-full bg-green-700 border-[2.5px] border-white dark:border-zinc-900 flex items-center justify-center"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>
          <div className="text-center">
            <p className="text-[18px] font-medium text-zinc-900 dark:text-zinc-50">
              {fullName || "Your Name"}
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {boatName ? `${boatName} · ` : ""}Skipper
            </p>
          </div>
          {avatarDataUrl && (
            <button type="button" onClick={removePhoto}
              className="text-[12px] text-red-500 active:opacity-70">
              Remove photo
            </button>
          )}
        </div>

        {/* Account strip */}
        {signedIn && accountEmail && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{accountEmail}</span>
            </p>
          </div>
        )}

        {/* Personal fields */}
        <p className="px-5 pt-5 pb-1.5 text-[11px] font-medium tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
          Personal
        </p>
        <div className="bg-white dark:bg-zinc-900 border-t border-b border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          {/* Name */}
          <div className="flex items-center px-5 gap-3 min-h-[52px]">
            <div className="size-8 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </div>
            <span className="w-[76px] shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              Name<span className="text-red-500 ml-0.5">*</span>
            </span>
            <input
              required minLength={2} maxLength={120} autoComplete="name"
              value={fullName} onChange={(e) => setFullNameState(e.target.value)}
              placeholder="Display name"
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 py-3.5"
            />
          </div>
          {/* Vessel */}
          <div className="flex items-center px-5 gap-3 min-h-[52px]">
            <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l2-8h14l2 8" /><path d="M12 2v7" /><path d="M3 17c0 2 1 3 9 3s9-1 9-3" /></svg>
            </div>
            <span className="w-[76px] shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">Vessel</span>
            <input
              value={boatName} onChange={(e) => setBoatNameState(e.target.value)}
              placeholder="Boat name"
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 py-3.5"
            />
          </div>
          {/* Phone */}
          <div className="flex items-center px-5 gap-3 min-h-[52px]">
            <div className="size-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 5.68 5.68l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.22 16z" /></svg>
            </div>
            <span className="w-[76px] shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">Phone</span>
            <input
              type="tel" autoComplete="tel" inputMode="tel"
              value={phone} onChange={(e) => setPhoneState(e.target.value)}
              placeholder="+44 7700 900 123"
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 py-3.5"
            />
          </div>
        </div>

        {/* Photo section */}
        <p className="px-5 pt-5 pb-1.5 text-[11px] font-medium tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
          Photo
        </p>
        <div className="bg-white dark:bg-zinc-900 border-t border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center px-5 py-3 gap-3">
            <div className="size-11 rounded-[10px] bg-green-50 dark:bg-green-950/40 flex items-center justify-center shrink-0 overflow-hidden">
              {avatarDataUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarDataUrl} alt="" className="size-full object-cover" />
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] text-zinc-900 dark:text-zinc-50">Profile photo</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">Shown on your map pin when enabled</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button type="button" disabled={photoWorking}
                onClick={() => fileRef.current?.click()}
                className="size-9 rounded-full bg-green-700 flex items-center justify-center active:opacity-70"
                aria-label="Upload photo">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </button>
              {avatarDataUrl && (
                <button type="button" onClick={removePhoto}
                  className="size-9 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center active:opacity-70"
                  aria-label="Remove photo">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                </button>
              )}
            </div>
          </div>
          {/* Map pin toggle */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
              <div>
                <p className="text-[15px] text-zinc-900 dark:text-zinc-50">Show on map pin</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Display photo on your location marker</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
              <input type="checkbox" checked={showAvatar} onChange={(e) => setShowAvatarState(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </div>
        </div>

        {/* Error */}
        <div ref={statusRef} className="px-5 pt-3">{errorBlock}</div>

        {/* Save button */}
        <div className="px-5 pt-5">
          <button type="submit" disabled={saving || photoWorking}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-green-700 text-[16px] font-medium text-white active:bg-green-800 disabled:opacity-50">
            {saving
              ? <><svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Saving…</>
              : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Save changes</>}
          </button>
        </div>

        {/* Footer links */}
        <div className="flex justify-center gap-5 pt-4">
          {signedIn && accountEmail && (
            <Link href={`/forgot-password?email=${encodeURIComponent(accountEmail)}`}
              className="text-[13px] text-green-700 dark:text-green-400">
              Change password
            </Link>
          )}
          {!signedIn && (
            <Link href="/sign-in" className="text-[13px] text-green-700 dark:text-green-400">
              Sign in
            </Link>
          )}
        </div>
      </form>
    );
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