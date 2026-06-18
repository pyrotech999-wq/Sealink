"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LAST_SIGNIN_EMAIL_STORAGE_KEY, normaliseEmail } from "@/lib/email-normalise";
import { getBoatName, setAvatarDataUrl, setBoatName, setFullName, setProfilePhone } from "@/lib/map-profile-storage";
import { normalisePhone } from "@/lib/phone-normalise";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";
import { humanGeolocationMessage } from "@/lib/geolocation-utils";
import { OAuthProviderButtons } from "@/components/OAuthProviderButtons";
import { compressProfilePhoto, PROFILE_PHOTO_MAX_BYTES } from "@/lib/client/compress-profile-photo";
import { oauthErrorMessage } from "@/lib/oauth-ui-messages";
import { Camera, Shield, Check, ArrowRight, ArrowLeft, Info, HelpCircle, PlusCircle } from "lucide-react";

type Step = 1 | 2 | 3 | 4;
type LocationAccess = "always" | "while_using";

const initial = {
  companyName: "",
  companyNumber: "",
  contactName: "",
  jobTitle: "",
  boatName: "",
  email: "",
  phoneDial: "+44",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  password: "",
  confirmPassword: "",
  agreeTerms: false,
  agreePrivacy: false,
  age: "",
  locationAccess: "always" as LocationAccess,
  bluetoothOptIn: false,
  smartNotificationsOptIn: false,
  invitedEmails: "",
};

const MAX_RAW_PHOTO_BYTES = 40 * 1024 * 1024;
const SIGNUP_DISCLAIMER_SESSION_KEY = "sealink_signup_disclaimer_v1";

const PHONE_DIAL_OPTIONS: { dial: string; label: string }[] = [
  { dial: "+44", label: "United Kingdom (+44)" },
  { dial: "+353", label: "Ireland (+353)" },
  { dial: "+1", label: "United States / Canada (+1)" },
  { dial: "+33", label: "France (+33)" },
  { dial: "+34", label: "Spain (+34)" },
  { dial: "+39", label: "Italy (+39)" },
  { dial: "+49", label: "Germany (+49)" },
  { dial: "+31", label: "Netherlands (+31)" },
  { dial: "+32", label: "Belgium (+32)" },
  { dial: "+351", label: "Portugal (+351)" },
  { dial: "+30", label: "Greece (+30)" },
  { dial: "+61", label: "Australia (+61)" },
  { dial: "+64", label: "New Zealand (+64)" },
  { dial: "+27", label: "South Africa (+27)" },
];

export default function MobileSignUpForm() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState(() => ({
    ...initial,
    boatName: typeof window !== "undefined" ? getBoatName() : "",
  }));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [notifHint, setNotifHint] = useState<string | null>(null);
  const [bleHint, setBleHint] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [profileAvatarDataUrl, setProfileAvatarDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLFormElement>(null);
  const [step4PrimaryReady, setStep4PrimaryReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupDisclaimerOpen, setSignupDisclaimerOpen] = useState(false);
  const [signupDisclaimerChecked, setSignupDisclaimerChecked] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);

  const progress = useMemo(() => ({ 1: 25, 2: 50, 3: 75, 4: 100 }[step]), [step]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    if (step !== 4) {
      queueMicrotask(() => setStep4PrimaryReady(false));
      return;
    }
    queueMicrotask(() => setStep4PrimaryReady(false));
    const id = window.setTimeout(() => setStep4PrimaryReady(true), 550);
    return () => window.clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (step !== 4) return;
    const el = formTopRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    if (submitted) return;
    const id = window.setTimeout(() => {
      try {
        if (sessionStorage.getItem(SIGNUP_DISCLAIMER_SESSION_KEY) !== "1") {
          setSignupDisclaimerOpen(true);
        }
      } catch {
        setSignupDisclaimerOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [submitted]);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const o = oauthErrorMessage(p.get("oauth_err"));
      if (o) {
        setErrors((e) => ({ ...e, submit: o }));
        p.delete("oauth_err");
        const qs = p.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    if (!signupDisclaimerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [signupDisclaimerOpen]);

  function dismissSignupDisclaimer() {
    try {
      sessionStorage.setItem(SIGNUP_DISCLAIMER_SESSION_KEY, "1");
    } catch {
      /* private mode */
    }
    setSignupDisclaimerOpen(false);
    setSignupDisclaimerChecked(false);
  }

  function set<K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function clearPhotoError() {
    setErrors((e) => {
      const next = { ...e };
      delete next.profilePhoto;
      return next;
    });
  }

  async function onPickPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((e) => ({ ...e, profilePhoto: "Choose an image file (JPEG, PNG, or WebP)" }));
      return;
    }
    if (file.size > MAX_RAW_PHOTO_BYTES) {
      setErrors((e) => ({
        ...e,
        profilePhoto: "That file is too large to process in the browser (40MB max). Try a smaller original.",
      }));
      return;
    }
    clearPhotoError();
    setPhotoProcessing(true);
    try {
      const processed = await compressProfilePhoto(file);
      if (processed.size > PROFILE_PHOTO_MAX_BYTES) {
        setErrors((e) => ({
          ...e,
          profilePhoto: "Could not shrink that photo enough. Try a different image or lower resolution.",
        }));
        return;
      }
      setPhotoFile(processed);
      setProfileAvatarDataUrl(null);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(processed);
      });

      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const url = String(reader.result || "");
            setAvatarDataUrl(url);
            setProfileAvatarDataUrl(url);
            resolve();
          } catch {
            reject(new Error("read"));
          }
        };
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(processed);
      });
    } catch {
      setErrors((e) => ({
        ...e,
        profilePhoto: "Could not process that image. Try a different photo.",
      }));
    } finally {
      setPhotoProcessing(false);
    }
  }

  function removePhoto() {
    clearPhotoError();
    setPhotoFile(null);
    setProfileAvatarDataUrl(null);
    setAvatarDataUrl(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateStep(s: Step): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!photoFile) e.profilePhoto = "Add a profile photo";
      const ageNum = parseInt(form.age, 10);
      if (!form.age.trim()) e.age = "Enter your age";
      else if (Number.isNaN(ageNum) || ageNum < 13 || ageNum > 120) e.age = "Enter a valid age (13–120)";
      if (!form.contactName.trim()) e.contactName = "Enter your name";
      else if (form.contactName.trim().length < 2) e.contactName = "Use at least 2 characters.";
      if (!form.boatName.trim()) e.boatName = "Enter your boat name";
      else if (form.boatName.trim().length < 2 || form.boatName.trim().length > 80) e.boatName = "Boat name must be 2–80 characters.";
      if (!form.email.trim()) e.email = "Enter your email";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    }
    if (s === 2) {
      const dialOk = /^\+[1-9]\d{0,3}$/.test(form.phoneDial.trim());
      if (!dialOk) e.phoneDial = "Choose a valid country code";
      const nationalDigits = form.phone.replace(/\D/g, "");
      if (!nationalDigits) e.phone = "Enter your phone number";
      else if (nationalDigits.length < 6) e.phone = "Phone number looks too short";
      else if (nationalDigits.length > 14) e.phone = "Phone number looks too long";
    }
    if (s === 3) {
      if (form.password.length < 10) e.password = "Use at least 10 characters";
      if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
      if (!form.agreeTerms) e.agreeTerms = "You need to accept the terms";
      if (!form.agreePrivacy) e.agreePrivacy = "You need to accept the privacy policy";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function back() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoHint("Location is not supported in this browser.");
      return;
    }
    setGeoHint(null);
    navigator.geolocation.getCurrentPosition(
      () =>
        setGeoHint(
          "Location permission verified for this session.",
        ),
      (err) => setGeoHint(humanGeolocationMessage(err)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 22_000 },
    );
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotifHint("Notifications are not supported in this browser.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifHint(
        result === "granted"
          ? "Smart alerts enabled successfully."
          : "Notification permission was denied.",
      );
      set("smartNotificationsOptIn", result === "granted");
    } catch {
      setNotifHint("Could not request notification permission.");
    }
  }

  async function requestBluetooth() {
    const nav = navigator as Navigator & { bluetooth?: { requestDevice: (opts: object) => Promise<unknown> } };
    if (!nav.bluetooth?.requestDevice) {
      setBleHint("Bluetooth pairing needs Web Bluetooth support.");
      return;
    }
    setBleHint(null);
    try {
      await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["generic_access"],
      });
      setBleHint("Bluetooth device pair checked.");
      set("bluetoothOptIn", true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pairing cancelled.";
      setBleHint(msg);
    }
  }

  async function shareApp() {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    setShareHint(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: "SeaLink",
          text: "Join my Circle on SeaLink — family location and check-ins.",
          url,
        });
        setShareHint("Thanks for sharing.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareHint("App link copied to clipboard.");
      } else {
        setShareHint(`Copy link: ${url}`);
      }
    } catch {
      setShareHint("Share cancelled.");
    }
  }

  async function completeSignUp() {
    if (step !== 4) return;
    if (!validateStep(4)) return;
    if (!form.contactName.trim() || form.contactName.trim().length < 2) {
      setErrors((e) => ({
        ...e,
        contactName: "Use at least 2 characters for your name.",
      }));
      return;
    }
    if (!step4PrimaryReady || submitting) return;
    setSubmitting(true);
    setBoatName(form.boatName);
    setFullName(form.contactName);
    const national = form.phone.replace(/^0+/, "").replace(/\D/g, "");
    const fullPhone = normalisePhone(`${form.phoneDial.trim()}${national}`);
    setProfilePhone(fullPhone);
    const ageNum = parseInt(form.age, 10);

    try {
      const deviceId = getOrCreateDeviceId();
      const deviceName = getDeviceName();
      const r = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          deviceId,
          deviceName,
          profile: {
            fullName: form.contactName.trim(),
            boatName: form.boatName.trim(),
            phone: fullPhone,
            age: ageNum,
            line1: form.line1.trim(),
            line2: form.line2.trim(),
            city: form.city.trim(),
            postcode: form.postcode.trim(),
            invitedEmails: form.invitedEmails.trim(),
            locationAccess: form.locationAccess,
            avatarDataUrl: profileAvatarDataUrl,
          },
        }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setErrors((e) => ({ ...e, submit: d.error || "Could not create account." }));
        return;
      }
      try {
        localStorage.setItem(LAST_SIGNIN_EMAIL_STORAGE_KEY, normaliseEmail(form.email.trim()));
      } catch {
        /* */
      }
      setSubmitted(true);
    } catch {
      setErrors((e) => ({ ...e, submit: "Network error. Try again." }));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (step < 4) {
      next();
      return;
    }
    if (!step4PrimaryReady) return;
    await completeSignUp();
  }

  // Account creation completed
  if (submitted) {
    return (
      <div className="w-full bg-gradient-to-br from-[#0c1a30]/90 to-[#061020]/95 border border-white/[0.08] p-6 rounded-[28px] backdrop-blur-xl shadow-2xl space-y-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <Check size={24} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white tracking-tight">Account Created</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Your profile and preferences have been successfully registered to the database. Next, sign in to confirm details and finalize crew setup.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-3">
          <Link
            href="/sign-in"
            className="w-full h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-1.5"
          >
            <span>Proceed to Sign In</span>
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/"
            className="w-full h-11 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:bg-white/[0.1] active:scale-[0.98] text-xs font-bold transition-all flex items-center justify-center"
          >
            Home (Guest view)
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Dynamic Safety Disclaimer Modal Sheet */}
      {signupDisclaimerOpen && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] border-t border-white/[0.1] bg-gradient-to-b from-[#09152b] to-[#040a15] shadow-2xl animate-slide-up">

            <div className="border-b border-amber-500/25 bg-amber-500/5 px-5 py-4">
              <p className="text-base font-extrabold text-amber-400 tracking-tight flex items-center gap-2">
                <Shield size={18} />
                Important Safety Notice
              </p>
              <p className="mt-1 text-[11px] text-slate-300 leading-tight">
                Review this recreational limitation guide before starting registration.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs leading-relaxed text-slate-200">
              <ul className="list-disc space-y-3 pl-4 text-slate-300">
                <li>
                  <strong className="text-white">Recreational Use Only</strong> — Not a substitute for professional navigation, certified marine training, or official marine charts.
                </li>
                <li>
                  <strong className="text-white">No Passaging/Sailing Plans</strong> — Do not use SeaLink to calculate passage routing or decide sailing safety parameters.
                </li>
                <li>
                  <strong className="text-white">Official Weather Feeds</strong> — Do not rely on forecasts in this app for heavy weather decisions; obtain official warnings.
                </li>
                <li>
                  <strong className="text-white">Emergency Procedures</strong> — Use standard VHF/HF radios and MRCC distress channels first. In-app MOB functions are optional backups only.
                </li>
              </ul>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#0c1a30]/50 p-4 transition-all mt-4">
                <input
                  type="checkbox"
                  checked={signupDisclaimerChecked}
                  onChange={(ev) => setSignupDisclaimerChecked(ev.target.checked)}
                  className="mt-0.5 size-4 rounded border-white/20 bg-slate-900 text-cyan-600 focus:ring-cyan-600"
                />
                <span className="text-xs font-bold text-slate-200">
                  I understand and accept these safety conditions.
                </span>
              </label>
            </div>

            <div className="shrink-0 border-t border-white/[0.06] bg-[#071328] p-4 flex flex-col gap-2.5">
              <Link
                href="/terms"
                className="w-full h-11 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:bg-white/[0.1] text-xs font-bold transition-all flex items-center justify-center"
              >
                Read Full Terms
              </Link>
              <button
                type="button"
                disabled={!signupDisclaimerChecked}
                onClick={dismissSignupDisclaimer}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-xs font-bold text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Acknowledge and Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Multi-step form */}
      <form
        ref={formTopRef}
        onSubmit={onSubmit}
        inert={signupDisclaimerOpen ? true : undefined}
        className="w-full bg-gradient-to-br from-[#0c1a30]/90 to-[#061020]/95 border border-white/[0.08] p-6 rounded-[28px] backdrop-blur-xl shadow-2xl space-y-5"
      >
        {errors.submit && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/15 p-3 text-center text-xs text-red-400 animate-shake">
            {errors.submit}
          </p>
        )}

        {step === 1 && (
          <div className="mb-2">
            <OAuthProviderButtons emphasizeGoogle signUpCaption />
          </div>
        )}

        {/* Dynamic high-tech steps progress */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">
            <span>Transmission Deck Progress</span>
            <span className="text-cyan-400 font-extrabold">{progress}% (Step {step} of 4)</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.04] border border-white/[0.08] p-[1px]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step 1: Base Profile Details */}
        {step === 1 && (
          <div className="space-y-4">

            {/* Profile image picker */}
            <div className="bg-[#0b172a]/30 border border-white/[0.04] p-4 rounded-2xl space-y-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block pl-0.5">
                Profile Transmission Code (Photo)
              </span>

              <div className="flex items-center gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-[#0d1c33]/60 flex items-center justify-center shadow-inner group">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Preview" className="size-full object-cover" />
                  ) : (
                    <Camera size={20} className="text-slate-500 group-hover:text-slate-400" />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={photoProcessing}
                    onChange={(e) => void onPickPhoto(e)}
                  />
                  <button
                    type="button"
                    disabled={photoProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] text-xs font-bold text-white transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    {photoProcessing ? "Processing..." : "Select Image"}
                  </button>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="text-[10px] font-bold text-red-400 hover:text-red-300 text-left pl-1 transition-colors"
                    >
                      Delete Selection
                    </button>
                  )}
                </div>
              </div>
              {errors.profilePhoto && <p className="text-[10px] font-semibold text-red-400 mt-1">{errors.profilePhoto}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="age">
                  Age
                </label>
                <input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={13}
                  max={120}
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.age}
                  onChange={(ev) => set("age", ev.target.value)}
                  placeholder="e.g. 25"
                />
                {errors.age && <p className="text-[10px] text-red-400 mt-1">{errors.age}</p>}
              </div>

              <div className="col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="contactName">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="contactName"
                  required
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.contactName}
                  onChange={(ev) => set("contactName", ev.target.value)}
                  placeholder="e.g. John Doe"
                />
                {errors.contactName && <p className="text-[10px] text-red-400 mt-1">{errors.contactName}</p>}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="boatName">
                Vessel Name <span className="text-red-500">*</span>
              </label>
              <input
                id="boatName"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.boatName}
                onChange={(ev) => set("boatName", ev.target.value)}
                placeholder="e.g. Wavy"
              />
              {errors.boatName && <p className="text-[10px] text-red-400 mt-1">{errors.boatName}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.email}
                onChange={(ev) => set("email", ev.target.value)}
                placeholder="e.g. helm@sealink.com"
              />
              {errors.email && <p className="text-[10px] text-red-400 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="companyName">
                Circle/Household Label
              </label>
              <input
                id="companyName"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.companyName}
                onChange={(ev) => set("companyName", ev.target.value)}
                placeholder="e.g. The Smiths Crew"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="companyNumber">
                  Invite Code
                </label>
                <input
                  id="companyNumber"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.companyNumber}
                  onChange={(ev) => set("companyNumber", ev.target.value)}
                  placeholder="e.g. INV-1234"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="jobTitle">
                  Map Call Sign/Nickname
                </label>
                <input
                  id="jobTitle"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.jobTitle}
                  onChange={(ev) => set("jobTitle", ev.target.value)}
                  placeholder="e.g. Captain Alex"
                />
              </div>
            </div>

          </div>
        )}

        {/* Step 2: Contact Address & Phone details */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-[#0b172a]/30 border border-white/[0.04] p-4.5 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block leading-relaxed">
                Contact Address info is optional. Phone number is required for Circle matching and active anchor alarm signals.
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="line1">
                Street Address Line 1
              </label>
              <input
                id="line1"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.line1}
                onChange={(ev) => set("line1", ev.target.value)}
                placeholder="e.g. Marina View Rd"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="line2">
                Street Address Line 2
              </label>
              <input
                id="line2"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.line2}
                placeholder="e.g. Berth 4"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="city">
                  Town / City
                </label>
                <input
                  id="city"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.city}
                  onChange={(ev) => set("city", ev.target.value)}
                  placeholder="e.g. Southampton"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="postcode">
                  Postcode
                </label>
                <input
                  id="postcode"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.postcode}
                  onChange={(ev) => set("postcode", ev.target.value)}
                  placeholder="e.g. SO15"
                />
              </div>
            </div>

            {/* Mobile Phone country matching */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" id="phone-label">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col gap-2.5">
                <select
                  id="phoneDial"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white outline-none focus:border-cyan-500/50 appearance-none"
                  value={form.phoneDial}
                  onChange={(ev) => set("phoneDial", ev.target.value)}
                >
                  {PHONE_DIAL_OPTIONS.map((o) => (
                    <option key={o.dial} value={o.dial} className="bg-[#0c1a30] text-white">
                      {o.label}
                    </option>
                  ))}
                </select>

                <input
                  id="phone"
                  type="tel"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  value={form.phone}
                  onChange={(ev) => set("phone", ev.target.value)}
                  placeholder="National number (e.g. 7700 900123)"
                />
              </div>
              {errors.phoneDial && <p className="text-[10px] text-red-400 mt-1">{errors.phoneDial}</p>}
              {errors.phone && <p className="text-[10px] text-red-400 mt-1">{errors.phone}</p>}
            </div>

          </div>
        )}

        {/* Step 3: Password credentials & agreement */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="password">
                Secure Key (Password)
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.password}
                onChange={(ev) => set("password", ev.target.value)}
                placeholder="Minimum 10 characters"
              />
              {errors.password && <p className="text-[10px] text-red-400 mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5 pl-1" htmlFor="confirmPassword">
                Verify Secure Key
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0c1a30] px-3.5 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                value={form.confirmPassword}
                onChange={(ev) => set("confirmPassword", ev.target.value)}
                placeholder="Confirm password"
              />
              {errors.confirmPassword && <p className="text-[10px] text-red-400 mt-1">{errors.confirmPassword}</p>}
            </div>

            {/* Legal checklist */}
            <div className="space-y-3 pt-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/15 p-4 transition-all">
                <input
                  type="checkbox"
                  checked={form.agreeTerms && form.agreePrivacy}
                  onChange={(ev) => {
                    set("agreeTerms", ev.target.checked);
                    set("agreePrivacy", ev.target.checked);
                  }}
                  className="mt-0.5 size-4 rounded border-white/20 bg-slate-900 text-cyan-600 focus:ring-cyan-600"
                />
                <span className="text-xs text-slate-300">
                  I accept and agree to the{" "}
                  <Link href="/terms" className="font-bold text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
                    terms of service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-bold text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
                    privacy guidelines
                  </Link>.
                </span>
              </label>
              {(errors.agreeTerms || errors.agreePrivacy) && (
                <p className="text-[10px] font-semibold text-red-400 ml-1">{errors.agreeTerms || errors.agreePrivacy}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: System preferences and sharing invites */}
        {step === 4 && (
          <div className="space-y-5">

            {/* Location choice widget */}
            <div className="bg-[#0b172a]/30 border border-white/[0.04] p-4.5 rounded-2xl space-y-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block pl-0.5">
                Location Tracking Mode
              </span>
              <p className="text-[10px] text-slate-400 leading-normal">
                To receive prompt anchor drift notices and circle proximity triggers in the background, select the recommended background permissions.
              </p>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-[#0c1a30] p-3">
                  <input
                    type="radio"
                    name="locationAccess"
                    checked={form.locationAccess === "always"}
                    onChange={() => set("locationAccess", "always")}
                    className="mt-1 size-4 text-cyan-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Always Allow Background (Recommended)</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Allows updates when app is closed to trigger drift sensors.</span>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-[#0c1a30] p-3">
                  <input
                    type="radio"
                    name="locationAccess"
                    checked={form.locationAccess === "while_using"}
                    onChange={() => set("locationAccess", "while_using")}
                    className="mt-1 size-4 text-cyan-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Only While Open</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Coordinates are evaluated only when active in foreground.</span>
                  </div>
                </label>
              </div>

              <button
                type="button"
                onClick={requestLocation}
                className="w-full py-2 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] text-xs font-bold text-white rounded-xl active:scale-95 transition-all"
              >
                Trigger Location Test
              </button>
              {geoHint && <p className="text-[10px] text-slate-300 font-semibold">{geoHint}</p>}
            </div>

            {/* Smart notifications & Bluetooth pair toggles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0b172a]/30 border border-white/[0.04] p-3 rounded-2xl flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Bluetooth Opt-In
                  </span>
                  <span className="text-[9.5px] text-slate-400 leading-normal block">
                    Pair boat tags or marine hardware.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestBluetooth}
                  className="w-full py-1.5 bg-white/[0.05] border border-white/[0.08] text-[10px] font-bold text-white rounded-lg active:scale-95 transition-all"
                >
                  Pair BT Tag
                </button>
                {bleHint && <p className="text-[9px] text-slate-300">{bleHint}</p>}
              </div>

              <div className="bg-[#0b172a]/30 border border-white/[0.04] p-3 rounded-2xl flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Smart Alerts
                  </span>
                  <span className="text-[9.5px] text-slate-400 leading-normal block">
                    Low battery warning and proximity pings.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestNotifications}
                  className="w-full py-1.5 bg-white/[0.05] border border-white/[0.08] text-[10px] font-bold text-white rounded-lg active:scale-95 transition-all"
                >
                  Enable Alerts
                </button>
                {notifHint && <p className="text-[9px] text-slate-300">{notifHint}</p>}
              </div>
            </div>

            {/* Circle email invitations */}
            <div className="bg-[#0b172a]/30 border border-white/[0.04] p-4.5 rounded-2xl space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block pl-0.5">
                Circle Recruitment (Invite Emails)
              </span>
              <textarea
                className="w-full min-h-[72px] rounded-xl border border-white/[0.08] bg-[#0c1a30] p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                placeholder="crew1@email.com, mate@email.com"
                value={form.invitedEmails}
                onChange={(ev) => set("invitedEmails", ev.target.value)}
              />
            </div>

            {/* Share app */}
            <div className="bg-[#0b172a]/30 border border-white/[0.04] p-4.5 rounded-2xl space-y-3">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block pl-0.5">
                Share Link
              </span>
              <button
                type="button"
                onClick={shareApp}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-xs font-bold text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <PlusCircle size={14} />
                Generate & Share App URL
              </button>
              {shareHint && <p className="text-[10px] text-slate-300 font-semibold">{shareHint}</p>}
            </div>

          </div>
        )}

        {/* Form controls navigation */}
        <div className="flex items-center gap-3 pt-3">
          {step > 1 && (
            <button
              type="button"
              onClick={back}
              className="flex items-center justify-center gap-1 w-1/3 h-11 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 text-xs font-bold transition-all active:scale-95"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          )}

          <div className="flex-1">
            {step < 4 ? (
              <button
                type="button"
                disabled={photoProcessing}
                onClick={next}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-1 hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={!step4PrimaryReady || submitting}
                onClick={() => void completeSignUp()}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-1 hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <span>{submitting ? "Establishing Account..." : "Confirm & Setup"}</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

      </form>
    </>
  );
}
