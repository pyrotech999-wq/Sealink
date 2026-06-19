"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Ship,
  Phone,
  Camera,
  Trash2,
  LogOut,
  ShieldAlert,
  FileText,
  Shield,
  HelpCircle,
  Save,
  AlertTriangle,
  UserCheck,
  Key
} from "lucide-react";
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

type Props = {
  signedIn: boolean;
  accountEmail: string;
  nameRequired?: boolean;
};

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

export function MobileProfile({ signedIn, accountEmail, nameRequired = false }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // ── Accordion States ──
  const [isEditOpen, setIsEditOpen] = useState(true);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [isDangerOpen, setIsDangerOpen] = useState(false);

  // ── Profile Form State ──
  const [fullName, setFullNameState] = useState("");
  const [boatName, setBoatNameState] = useState("");
  const [phone, setPhoneState] = useState("");
  const [showAvatar, setShowAvatarState] = useState(true);
  const [avatarDataUrl, setAvatarDataUrlState] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoWorking, setPhotoWorking] = useState(false);
  const [serverSync, setServerSync] = useState(false);

  // ── Delete Account State ──
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Initial State Loading ──
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

  // ── Image Handlers ──
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

  // ── Profile Save Handler ──
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

  // ── Sign Out Handler ──
  const handleSignOut = async () => {
    try {
      const r = await fetch("/api/demo/sign-out", { method: "POST" });
      if (r.ok) {
        window.location.href = "/";
      }
    } catch (err) {
      console.error("Failed to sign out", err);
    }
  };

  // ── Delete Account Handler ──
  const onDelete = useCallback(async () => {
    setDeleteError(null);
    const ok = window.confirm(
      "Delete your SeaLink account permanently? Your profile, devices, listings you posted, and subscription records tied to this account will be removed. This cannot be undone."
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      const r = await fetch("/api/auth/delete-data", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirm: "DELETE_MY_ACCOUNT" }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setDeleteError(d.error || "Could not delete account. Try again or use Help → Email developers.");
        return;
      }
      window.location.assign("/");
    } catch {
      setDeleteError("Network error. Check your connection and try again.");
    } finally {
      setDeleteBusy(false);
    }
  }, []);

  // Derive initials for avatar fallback
  const nameParts = fullName.trim().split(" ").filter(Boolean);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : fullName.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col overflow-x-hidden">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={photoWorking}
        onChange={(e) => void onPickPhoto(e)}
      />

      {/* Nav Header */}
      <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
              Profile &amp; Settings
            </h1>
            <p className="text-[9px] text-zinc-500">
              Manage your SeaLink presence &amp; data
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24">
        {nameRequired && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4.5 flex items-start gap-3 shadow-lg backdrop-blur-md">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
            <div className="text-left">
              <h3 className="text-xs font-bold text-amber-200">Name Required</h3>
              <p className="text-[10px] text-amber-100/70 leading-normal mt-1">
                Please add your name (at least 2 characters) to continue using SeaLink, then save.
              </p>
            </div>
          </div>
        )}

        {/* User Hero Card */}
        <div className="bg-[#0c192c]/45 border border-white/[0.06] rounded-3xl p-5 shadow-lg backdrop-blur-md flex items-center gap-4.5">
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={photoWorking}
              onClick={() => fileRef.current?.click()}
              className="relative size-[72px] rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 via-cyan-500 to-emerald-500 active:scale-95 transition-all border-2 border-white/10 flex items-center justify-center shadow-md"
            >
              {avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarDataUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white tracking-wider">
                  {initials}
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={photoWorking}
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 size-6 rounded-full bg-cyan-500 border border-white/10 flex items-center justify-center text-black active:scale-95 transition-all shadow"
            >
              <Camera size={12} />
            </button>
          </div>

          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-base font-extrabold text-slate-100 truncate leading-snug">
              {fullName || "Boater Profile"}
            </h2>
            <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
              {signedIn && accountEmail ? accountEmail : "Local Account"}
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-2">
              {signedIn ? "Cloud Sync Active" : "Local Map Profile"}
            </span>
          </div>
        </div>

        {/* ── ACCORDION 1: EDIT PROFILE DETAILS ── */}
        <div className="bg-[#0c192c]/45 border border-white/[0.06] rounded-3xl overflow-hidden shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsEditOpen(!isEditOpen)}
            className="w-full flex items-center justify-between p-4.5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <User size={15} className="text-cyan-400" />
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Edit Profile Details</span>
            </div>
            {isEditOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
          </button>

          {isEditOpen && (
            <form onSubmit={onSave} className="p-4.5 border-t border-white/[0.05] space-y-4 text-left">
              {/* Display Name Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                  <span>Display Name</span>
                  <span className="text-red-400 font-black">*</span>
                </label>
                <div className="flex items-center gap-2 bg-[#081222]/80 border border-white/[0.05] rounded-xl px-3 py-2.5">
                  <User size={14} className="text-zinc-500" />
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullNameState(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500"
                  />
                </div>
              </div>

              {/* Vessel Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Vessel Name
                </label>
                <div className="flex items-center gap-2 bg-[#081222]/80 border border-white/[0.05] rounded-xl px-3 py-2.5">
                  <Ship size={14} className="text-zinc-500" />
                  <input
                    type="text"
                    value={boatName}
                    onChange={(e) => setBoatNameState(e.target.value)}
                    placeholder="e.g. Sealink II"
                    className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500"
                  />
                </div>
              </div>

              {/* Phone Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Phone Number
                </label>
                <div className="flex items-center gap-2 bg-[#081222]/80 border border-white/[0.05] rounded-xl px-3 py-2.5">
                  <Phone size={14} className="text-zinc-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhoneState(e.target.value)}
                    placeholder="e.g. +447700900123"
                    className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500"
                  />
                </div>
              </div>

              {/* Avatar options inside editing */}
              {avatarDataUrl && (
                <div className="flex items-center justify-between bg-red-950/15 border border-red-500/10 rounded-xl p-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-200">Custom Profile Picture</p>
                    <p className="text-[9px] text-zinc-500">Currently loaded on maps</p>
                  </div>
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="text-[10px] font-bold text-red-400 flex items-center gap-1 active:scale-95"
                  >
                    <Trash2 size={12} />
                    <span>Remove Photo</span>
                  </button>
                </div>
              )}

              {/* Map pin visibility toggle */}
              <div className="flex items-center justify-between border-t border-white/[0.05] pt-3.5 mt-2">
                <div>
                  <p className="text-xs font-bold text-slate-200">Show on Map Pin</p>
                  <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Allow other boaters to view your photo</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAvatar}
                    onChange={(e) => setShowAvatarState(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-cyan-500 transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              </div>

              {/* Save error message */}
              {error && (
                <p ref={statusRef} className="rounded-xl border border-red-500/20 bg-red-950/20 px-3 py-2.5 text-xs text-red-300 leading-normal">
                  {error}
                </p>
              )}

              {/* Save changes button */}
              <button
                type="submit"
                disabled={saving || photoWorking}
                className="w-full flex items-center justify-center gap-2 rounded-2xl h-11 bg-cyan-600 hover:bg-cyan-500 text-sm font-bold text-white transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-cyan-900/10 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* ── ACCORDION 2: HELP & LEGAL DOCUMENTS ── */}
        <div className="bg-[#0c192c]/45 border border-white/[0.06] rounded-3xl overflow-hidden shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsLegalOpen(!isLegalOpen)}
            className="w-full flex items-center justify-between p-4.5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <FileText size={15} className="text-cyan-400" />
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Help &amp; Legal Agreements</span>
            </div>
            {isLegalOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
          </button>

          {isLegalOpen && (
            <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
              {/* Help Link */}
              <Link
                href="/help"
                className="flex items-center justify-between p-4.5 hover:bg-white/[0.02] active:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle size={15} className="text-zinc-400" />
                  <span className="text-xs font-bold text-slate-200">Help Centre</span>
                </div>
                <ChevronRight size={14} className="text-zinc-600" />
              </Link>

              {/* Terms Link */}
              <Link
                href="/terms"
                className="flex items-center justify-between p-4.5 hover:bg-white/[0.02] active:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-zinc-400" />
                  <span className="text-xs font-bold text-slate-200">Terms of Use</span>
                </div>
                <ChevronRight size={14} className="text-zinc-600" />
              </Link>

              {/* Privacy Link */}
              <Link
                href="/privacy"
                className="flex items-center justify-between p-4.5 hover:bg-white/[0.02] active:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <Shield size={15} className="text-zinc-400" />
                  <span className="text-xs font-bold text-slate-200">Privacy Policy</span>
                </div>
                <ChevronRight size={14} className="text-zinc-600" />
              </Link>
            </div>
          )}
        </div>

        {/* ── ACCORDION 3: ACCOUNT & DANGER ZONE ── */}
        {signedIn && (
          <div className="bg-[#0c192c]/45 border border-white/[0.06] rounded-3xl overflow-hidden shadow-lg backdrop-blur-md">
            <button
              type="button"
              onClick={() => setIsDangerOpen(!isDangerOpen)}
              className="w-full flex items-center justify-between p-4.5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert size={15} className="text-red-400 animate-pulse" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Account Operations</span>
              </div>
              {isDangerOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {isDangerOpen && (
              <div className="p-4.5 border-t border-white/[0.05] space-y-5 text-left">
                {/* Password reset link */}
                <div className="bg-[#081222]/50 border border-white/[0.04] rounded-2xl p-4.5 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Key size={14} className="text-zinc-400" />
                      <span>Security Settings</span>
                    </h3>
                    <p className="text-[10px] text-zinc-500 leading-normal mt-1">
                      Trigger a password change flow linked directly to your cloud verification account.
                    </p>
                  </div>
                  <Link
                    href={`/forgot-password?email=${encodeURIComponent(accountEmail)}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300"
                  >
                    <span>Change Password</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>

                {/* Logout action */}
                <div className="bg-[#081222]/50 border border-white/[0.04] rounded-2xl p-4.5 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <LogOut size={14} className="text-zinc-400" />
                      <span>Session Termination</span>
                    </h3>
                    <p className="text-[10px] text-zinc-500 leading-normal mt-1">
                      Sign out of the SeaLink server profile. Local coordinates mapping will cease.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex h-9 items-center justify-center px-4 rounded-xl border border-red-500/20 bg-red-950/20 hover:bg-red-950/40 text-[11px] font-bold text-red-400 active:scale-95 transition-all cursor-pointer"
                  >
                    Sign Out Account
                  </button>
                </div>

                {/* Account deletion section */}
                <div className="bg-[#1f0e0e]/20 border border-red-900/20 rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-xs font-bold text-red-200">Delete Account Permanently</h3>
                      <p className="text-[10px] text-red-400/70 leading-normal mt-1.5">
                        This action will immediately destroy all profile databases, boat and gear listings, message archives, and subscription configurations mapped to this user identifier. **This operation is irreversible.**
                      </p>
                    </div>
                  </div>

                  {deleteError && (
                    <p className="rounded-xl border border-red-900/40 bg-red-950/50 px-3 py-2 text-[10px] text-red-300 leading-normal">
                      {deleteError}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => void onDelete()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl h-10 bg-red-650 hover:bg-red-550 text-xs font-bold text-white transition-all active:scale-[0.98] cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.15)] disabled:opacity-50"
                  >
                    {deleteBusy ? (
                      <>
                        <span className="animate-spin inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                        <span>Purging Data...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        <span>Confirm Account Deletion</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Small non-signed-in Sign In option */}
        {!signedIn && (
          <div className="bg-[#0c192c]/45 border border-white/[0.06] rounded-3xl p-5 text-center shadow-lg backdrop-blur-md space-y-3">
            <UserCheck size={28} className="text-cyan-400 mx-auto" />
            <div>
              <h3 className="text-xs font-bold text-slate-200">Save Your Progress</h3>
              <p className="text-[10px] text-zinc-500 leading-normal mt-1">
                Sign in to back up your vessel and gear listings, sync chat threads across handsets, and save charts.
              </p>
            </div>
            <Link
              href="/sign-in"
              className="w-full flex items-center justify-center gap-2 rounded-2xl h-11 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-all active:scale-[0.98] block py-3.5 shadow-md"
            >
              Sign In Account
            </Link>
          </div>
        )}
      </div>

      {/* Info Footnote */}
      <div className="p-4 text-center shrink-0">
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest">SeaLink Client Profile Systems</p>
      </div>
    </div>
  );
}
