"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { compressProfilePhoto } from "@/lib/client/compress-profile-photo";
import {
  getAvatarDataUrl,
  getBoatName,
  getFullName,
  getProfilePhone,
  getShowAvatar,
  setAvatarDataUrl,
  setBoatName,
  setFullName,
  setProfilePhone,
  setShowAvatar,
} from "@/lib/map-profile-storage";
import { validateProfileDisplayName } from "@/lib/profile-display-name";
import { normalisePhone } from "@/lib/phone-normalise";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Stay under map-profile-storage max (~450k chars) after base64 growth. */
const MAX_AVATAR_DATA_URL_CHARS = 430_000;

type Props = {
  signedIn: boolean;
  accountEmail: string;
  /** From `/profile?required=1` when account name is missing in the database. */
  nameRequired?: boolean;
};

async function shrinkAvatarDataUrlForStorage(dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_AVATAR_DATA_URL_CHARS) return trimmed;
  const res = await fetch(trimmed);
  const blob = await res.blob();
  const file = new File([blob], "profile.jpg", {
    type: blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg",
  });
  const small = await compressProfilePhoto(file);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not process photo. Try a smaller image."));
    reader.readAsDataURL(small);
  });
}

export function ProfileEditForm({ signedIn, accountEmail }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [fullName, setFullNameState] = useState("");
  const [boatName, setBoatNameState] = useState("");
  const [phone, setPhoneState] = useState("");
  const [showAvatar, setShowAvatarState] = useState(true);
  const [avatarDataUrl, setAvatarDataUrlState] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (!error) return;
    const id = requestAnimationFrame(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [error]);

  function onPickPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const url = String(reader.result || "");
        setAvatarDataUrlState(url);
      } catch {
        setError("Could not read that image. Try another file.");
      }
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setAvatarDataUrlState("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSave(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    setSaving(true);
    try {
      const nextAvatar = await shrinkAvatarDataUrlForStorage(avatarDataUrl);
      if (nextAvatar !== avatarDataUrl) {
        setAvatarDataUrlState(nextAvatar);
      }
      setBoatName(boatName);
      setFullName(fullName);
      setProfilePhone(normalisePhone(phone));
      if (nextAvatar) setAvatarDataUrl(nextAvatar);
      else setAvatarDataUrl(null);
      setShowAvatar(showAvatar);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="mt-8 space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
    >
      {signedIn && accountEmail ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">Account</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{accountEmail}</span>
          </p>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            To change your password, use{" "}
            <Link
              href={`/forgot-password?email=${encodeURIComponent(accountEmail)}`}
              className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400"
            >
              forgotten password
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/sign-in" className="font-medium text-green-800 hover:underline dark:text-green-400">
            Sign in
          </Link>{" "}
          to tie posting and adverts to your email. You can still update how you appear on the map below.
        </p>
      )}

      <div>
        <label htmlFor="profile-full" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Your name
        </label>
        <input
          id="profile-full"
          autoComplete="name"
          value={fullName}
          onChange={(e) => {
            setFullNameState(e.target.value);
          }}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <label htmlFor="profile-boat" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Boat name
        </label>
        <input
          id="profile-boat"
          value={boatName}
          onChange={(e) => {
            setBoatNameState(e.target.value);
          }}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <label htmlFor="profile-phone" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone <span className="font-normal text-zinc-500">(international, e.g. +447700900123)</span>
        </label>
        <input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => {
            setPhoneState(e.target.value);
          }}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Profile photo</p>
        <p className="mt-0.5 text-xs text-zinc-500">Shown on your map pin when enabled below (stored in this browser only).</p>
        <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900">
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user data URL
              <img src={avatarDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-xs text-zinc-400">No photo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800"
            >
              Change photo
            </button>
            {avatarDataUrl ? (
              <button
                type="button"
                onClick={removePhoto}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <input
          type="checkbox"
          checked={showAvatar}
          onChange={(e) => {
            setShowAvatarState(e.target.checked);
          }}
          className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Show profile photo on map pin (when a photo is saved)</span>
      </label>

      <div ref={statusRef} className="space-y-3">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex h-10 w-full items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[140px]"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
