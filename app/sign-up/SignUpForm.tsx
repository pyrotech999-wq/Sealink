"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LAST_SIGNIN_EMAIL_STORAGE_KEY, normaliseEmail } from "@/lib/email-normalise";
import { getBoatName, setAvatarDataUrl, setBoatName, setFullName, setProfilePhone } from "@/lib/map-profile-storage";
import { normalisePhone } from "@/lib/phone-normalise";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";
import { humanGeolocationMessage } from "@/lib/geolocation-utils";
import { compressProfilePhoto } from "@/lib/client/compress-profile-photo";

type Step = 1 | 2 | 3 | 4;

type LocationAccess = "always" | "while_using";

const initial = {
  companyName: "",
  companyNumber: "",
  contactName: "",
  jobTitle: "",
  boatName: "",
  email: "",
  /** E.164 dial prefix, e.g. +44 */
  phoneDial: "+44",
  /** National number (no country code) */
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

/** Large photos are shrunk in the browser before upload; cap raw picker size to avoid memory issues. */
const MAX_PHOTO_BYTES = 24 * 1024 * 1024;

/** Session-only: after user acknowledges safety disclaimer, do not show again until a new tab/session. */
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

export function SignUpForm() {
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
  /** Stops the primary action sitting under the thumb from firing twice when step 3 → 4 re-renders on mobile. */
  const [step4PrimaryReady, setStep4PrimaryReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupDisclaimerOpen, setSignupDisclaimerOpen] = useState(false);
  const [signupDisclaimerChecked, setSignupDisclaimerChecked] = useState(false);

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
    if (file.size > MAX_PHOTO_BYTES) {
      setErrors((e) => ({ ...e, profilePhoto: "That file is too large to process here. Try a smaller original or another photo." }));
      return;
    }
    clearPhotoError();
    let processed: File;
    try {
      processed = await compressProfilePhoto(file);
    } catch {
      setErrors((e) => ({ ...e, profilePhoto: "Could not process that image. Try a different photo." }));
      return;
    }
    setPhotoFile(processed);
    setProfileAvatarDataUrl(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(processed);
    });

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const url = String(reader.result || "");
        setAvatarDataUrl(url);
        setProfileAvatarDataUrl(url);
      } catch {
        setErrors((e) => ({
          ...e,
          profilePhoto: "That photo is still too large after resizing. Try a simpler image or lower resolution.",
        }));
      }
    };
    reader.readAsDataURL(processed);
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
      else if (form.contactName.trim().length < 2) e.contactName = "Use at least 2 characters (e.g. first and last name).";
      if (!form.boatName.trim()) e.boatName = "Enter your boat name";
      else if (form.boatName.trim().length < 2 || form.boatName.trim().length > 80) e.boatName = "Boat name must be 2–80 characters.";
      if (!form.email.trim()) e.email = "Enter your email";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    }
    if (s === 2) {
      if (!form.line1.trim()) e.line1 = "Enter the first line of your address";
      if (!form.city.trim()) e.city = "Enter town or city";
      if (!form.postcode.trim()) e.postcode = "Enter postcode";
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
    if (s === 4) {
      // no additional fields; step 4 is preferences/share
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
          "Location works for this browser session. Your \"always\" vs \"while using\" choice is saved for the native app.",
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
          ? "You’ll get smart alerts for this site (arrivals, invites, and reminders in a full build)."
          : result === "denied"
            ? "Notifications were denied. You can change this in browser settings."
            : "Notification permission dismissed.",
      );
      set("smartNotificationsOptIn", result === "granted");
    } catch {
      setNotifHint("Could not request notification permission.");
    }
  }

  async function requestBluetooth() {
    const nav = navigator as Navigator & { bluetooth?: { requestDevice: (opts: object) => Promise<unknown> } };
    if (!nav.bluetooth?.requestDevice) {
      setBleHint("Bluetooth pairing needs Web Bluetooth (often Chrome desktop) or the native app.");
      return;
    }
    setBleHint(null);
    try {
      await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["generic_access"],
      });
      setBleHint("Bluetooth device selected.");
      set("bluetoothOptIn", true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request cancelled or failed.";
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
        setShareHint(`Copy this link manually: ${url}`);
      }
    } catch {
      setShareHint("Share was cancelled or is not available.");
    }
  }

  async function completeSignUp() {
    if (step !== 4) return;
    if (!validateStep(4)) return;
    if (!form.contactName.trim() || form.contactName.trim().length < 2) {
      setErrors((e) => ({
        ...e,
        contactName: "Use at least 2 characters for your name (e.g. first and last name).",
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
    console.info("sign-up", {
      ...form,
      phone: fullPhone,
      age: ageNum,
      profilePhoto: photoFile ? { name: photoFile.name, size: photoFile.size, type: photoFile.type } : null,
      invitedEmails: form.invitedEmails
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    });

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

  if (submitted) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Account created</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Your profile and preferences are saved. Next, sign in with the email and password you just chose. After you
          sign in, SeaLink will take you through plans and payment before full app access.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
          >
            Sign in to continue
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Home (guest)
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {signupDisclaimerOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-disclaimer-title"
            className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 sm:rounded-2xl"
          >
            <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/40">
              <p id="signup-disclaimer-title" className="text-base font-bold text-amber-950 dark:text-amber-100">
                Important — please read before you sign up
              </p>
              <p className="mt-1 text-xs font-medium text-amber-900/90 dark:text-amber-200/90">
                SeaLink is for recreational use only. These points are a short summary of our{" "}
                <Link href="/terms" className="underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-50">
                  terms of use
                </Link>
                .
              </p>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
              <ul className="list-disc space-y-2 pl-4 text-zinc-700 dark:text-zinc-300">
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Recreational use only</strong> — not a replacement for
                  official charts, training, or your own judgement at sea.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Do not use SeaLink to plan trips or sailing</strong> — do
                  not use it to decide whether to go to sea, route a passage, or navigate.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Get official weather</strong> for any real decision — what
                  you see here is general interest and entertainment, not an official forecast service.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Emergencies</strong> — use{" "}
                  <strong>VHF / HF / UHF</strong> distress where appropriate, call the <strong>coastguard / MRCC</strong>, and use
                  normal <strong>emergency phone numbers</strong> (e.g. 999, 112, 911). In-app help or messages are{" "}
                  <strong>only in addition</strong> to those channels, after you have raised the alarm properly.
                </li>
                <li>
                  <strong className="text-zinc-900 dark:text-zinc-100">Forecasts, maps, and messages may be wrong</strong> — do not
                  rely on them for safety, navigation, or legal decisions.
                </li>
              </ul>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded border-zinc-400 text-green-700 focus:ring-green-600"
                  checked={signupDisclaimerChecked}
                  onChange={(ev) => setSignupDisclaimerChecked(ev.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  I have read and understand these important limitations.
                </span>
              </label>
            </div>
            <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:justify-end">
              <Link
                href="/terms"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Open full terms
              </Link>
              <button
                type="button"
                disabled={!signupDisclaimerChecked}
                onClick={dismissSignupDisclaimer}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-green-700 px-5 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue to sign up
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form
        ref={formTopRef}
        onSubmit={onSubmit}
        inert={signupDisclaimerOpen ? true : undefined}
        className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
      {errors.submit ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {errors.submit}
        </p>
      ) : null}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Step {step} of 4</p>
          <p className="text-xs text-zinc-500">{progress}%</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Profile photo</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              A clear face photo helps people in your Circle recognise you on the map. Large pictures are shrunk automatically.
            </p>
            <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob preview
                  <img src={photoPreview} alt="Profile preview" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-zinc-400">No photo</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800"
                >
                  Upload photo
                </button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {errors.profilePhoto && <p className="mt-2 text-xs text-red-600">{errors.profilePhoto}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="age">
                Age
              </label>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                min={13}
                max={120}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 placeholder:text-zinc-400 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.age}
                onChange={(ev) => set("age", ev.target.value)}
                placeholder="e.g. 28"
              />
              {errors.age && <p className="mt-1 text-xs text-red-600">{errors.age}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="contactName">
                Your name <span className="font-normal text-red-600 dark:text-red-400">(required)</span>
              </label>
              <input
                id="contactName"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.contactName}
                onChange={(ev) => set("contactName", ev.target.value)}
              />
              {errors.contactName && <p className="mt-1 text-xs text-red-600">{errors.contactName}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="boatName">
              Boat name
            </label>
            <input
              id="boatName"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 placeholder:text-zinc-400 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.boatName}
              onChange={(ev) => set("boatName", ev.target.value)}
              placeholder="e.g. Wavy"
            />
            {errors.boatName && <p className="mt-1 text-xs text-red-600">{errors.boatName}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.email}
              onChange={(ev) => set("email", ev.target.value)}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="companyName">
              Family or household name <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="companyName"
              autoComplete="organization"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 placeholder:text-zinc-400 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.companyName}
              onChange={(ev) => set("companyName", ev.target.value)}
              placeholder="e.g. The Smiths"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="companyNumber">
                Invite code <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="companyNumber"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.companyNumber}
                onChange={(ev) => set("companyNumber", ev.target.value)}
                placeholder="If someone invited you"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="jobTitle">
                Map nickname <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="jobTitle"
                autoComplete="nickname"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.jobTitle}
                onChange={(ev) => set("jobTitle", ev.target.value)}
                placeholder="e.g. Mum, Alex"
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Home address powers place alerts (school, work, home) in a full app — same idea as family location apps on
            your phone.
          </p>
          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="line1">
              Address line 1
            </label>
            <input
              id="line1"
              autoComplete="address-line1"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.line1}
              onChange={(ev) => set("line1", ev.target.value)}
            />
            {errors.line1 && <p className="mt-1 text-xs text-red-600">{errors.line1}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="line2">
              Address line 2 <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="line2"
              autoComplete="address-line2"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.line2}
              onChange={(ev) => set("line2", ev.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="city">
                Town / city
              </label>
              <input
                id="city"
                autoComplete="address-level2"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.city}
                onChange={(ev) => set("city", ev.target.value)}
              />
              {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="postcode">
                Postcode
              </label>
              <input
                id="postcode"
                autoComplete="postal-code"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={form.postcode}
                onChange={(ev) => set("postcode", ev.target.value)}
              />
              {errors.postcode && <p className="mt-1 text-xs text-red-600">{errors.postcode}</p>}
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200" id="phone-label">
              Mobile phone <span className="font-normal text-zinc-500">(with country code)</span>
            </span>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="phoneDial">
                Country calling code
              </label>
              <select
                id="phoneDial"
                aria-labelledby="phone-label"
                className="w-full shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 sm:max-w-[220px]"
                value={form.phoneDial}
                onChange={(ev) => set("phoneDial", ev.target.value)}
              >
                {PHONE_DIAL_OPTIONS.map((o) => (
                  <option key={o.dial} value={o.dial}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="phone">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  aria-labelledby="phone-label"
                  placeholder="e.g. 7700 900123"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  value={form.phone}
                  onChange={(ev) => set("phone", ev.target.value)}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              We store this as an international number (e.g. +44…) for matching and alerts.
            </p>
            {errors.phoneDial && <p className="mt-1 text-xs text-red-600">{errors.phoneDial}</p>}
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.password}
              onChange={(ev) => set("password", ev.target.value)}
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            <p className="mt-1 text-xs text-zinc-500">At least 10 characters.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={form.confirmPassword}
              onChange={(ev) => set("confirmPassword", ev.target.value)}
            />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
                checked={form.agreeTerms}
                onChange={(ev) => set("agreeTerms", ev.target.checked)}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                I agree to the{" "}
                <Link href="/terms" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
                  terms of use
                </Link>
                .
              </span>
            </label>
            {errors.agreeTerms && <p className="mt-2 text-xs text-red-600">{errors.agreeTerms}</p>}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-zinc-300 text-green-700 focus:ring-green-600"
                checked={form.agreePrivacy}
                onChange={(ev) => set("agreePrivacy", ev.target.checked)}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                I agree to the{" "}
                <Link href="/privacy" className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            {errors.agreePrivacy && <p className="mt-2 text-xs text-red-600">{errors.agreePrivacy}</p>}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Location sharing</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              Apps like Life360 usually recommend all-day location so Circles see arrivals, Battery, and driving context.
              On the web, the browser only shares when you allow it here; on iPhone or Android, pick{" "}
              <span className="font-medium text-green-800 dark:text-green-400">Always</span> in system settings for the
              closest behaviour.
            </p>
            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="radio"
                  name="locationAccess"
                  className="mt-1 text-green-700"
                  checked={form.locationAccess === "always"}
                  onChange={() => set("locationAccess", "always")}
                />
                <span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Always allow</span>
                  <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-900 dark:bg-green-900/40 dark:text-green-200">
                    Recommended
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">Best for battery-friendly background updates on your phone.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="radio"
                  name="locationAccess"
                  className="mt-1 text-green-700"
                  checked={form.locationAccess === "while_using"}
                  onChange={() => set("locationAccess", "while_using")}
                />
                <span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Only while using the app</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">Location when SeaLink is open and active.</span>
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={requestLocation}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Check browser location
            </button>
            {geoHint && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{geoHint}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Bluetooth</p>
                  <p className="mt-1 text-xs text-zinc-500">For Bluetooth tags and in-car accessories some families pair with their map.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.bluetoothOptIn}
                  onClick={() => set("bluetoothOptIn", !form.bluetoothOptIn)}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${form.bluetoothOptIn ? "bg-green-600" : "bg-zinc-300 dark:bg-zinc-600"}`}
                >
                  <span
                    className={`pointer-events-none inline-block size-6 translate-y-0.5 rounded-full bg-white shadow transition-transform ${form.bluetoothOptIn ? "translate-x-5" : "translate-x-1"}`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={requestBluetooth}
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-white py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Pair / test Bluetooth
              </button>
              {bleHint && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{bleHint}</p>}
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Smart notifications</p>
                  <p className="mt-1 text-xs text-zinc-500">Circle activity, place alerts, and low-priority nudges — off by default until you opt in.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.smartNotificationsOptIn}
                  onClick={() => set("smartNotificationsOptIn", !form.smartNotificationsOptIn)}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${form.smartNotificationsOptIn ? "bg-green-600" : "bg-zinc-300 dark:bg-zinc-600"}`}
                >
                  <span
                    className={`pointer-events-none inline-block size-6 translate-y-0.5 rounded-full bg-white shadow transition-transform ${form.smartNotificationsOptIn ? "translate-x-5" : "translate-x-1"}`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={requestNotifications}
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-white py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Enable in browser
              </button>
              {notifHint && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{notifHint}</p>}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Add people to your Circle</p>
            <p className="mt-1 text-xs text-zinc-500">Invite family or friends by email so they can join your Circle (optional).</p>
            <textarea
              className="mt-2 min-h-[88px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-green-600/30 focus:border-green-600 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="mum@email.com, partner@email.com"
              value={form.invitedEmails}
              onChange={(ev) => set("invitedEmails", ev.target.value)}
            />
          </div>

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Share the app</p>
            <p className="mt-1 text-xs text-zinc-500">Send your invite link by message or copy it — same habit as sharing Life360 with family.</p>
            <button
              type="button"
              onClick={shareApp}
              className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Share SeaLink
            </button>
            {shareHint && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{shareHint}</p>}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <div className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Back
            </button>
          )}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-green-700 px-4 text-sm font-medium text-white hover:bg-green-800 sm:flex-none"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={!step4PrimaryReady || submitting}
              onClick={() => void completeSignUp()}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-green-700 px-4 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          )}
        </div>
      </div>
    </form>
    </>
  );
}
