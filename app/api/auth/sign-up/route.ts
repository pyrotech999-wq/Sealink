import { NextResponse } from "next/server";
import { uidFromEmail } from "@/lib/auth";
import { normaliseEmailFromInput } from "@/lib/email-normalise";
import { registerAccountDevice } from "@/lib/account-devices-store";
import { hashPassword } from "@/lib/password-hash";
import { getUserByEmail, upsertUser } from "@/lib/users-store";
import { validateProfileDisplayName } from "@/lib/profile-display-name";
import { upsertProfileAfterSignUp } from "@/lib/profiles-server";
import { normalisePhone } from "@/lib/phone-normalise";

export const runtime = "nodejs";

type ProfileBody = {
  fullName?: unknown;
  boatName?: unknown;
  phone?: unknown;
  age?: unknown;
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  postcode?: unknown;
  invitedEmails?: unknown;
  locationAccess?: unknown;
  avatarDataUrl?: unknown;
};

export async function POST(req: Request) {
  let email = "";
  let password = "";
  let deviceId = "";
  let deviceName = "";
  let profile: ProfileBody | null = null;
  try {
    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      deviceId?: unknown;
      deviceName?: unknown;
      profile?: ProfileBody;
    };
    email = typeof body.email === "string" ? normaliseEmailFromInput(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
    deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    deviceName = typeof body.deviceName === "string" ? body.deviceName : "";
    profile = body.profile && typeof body.profile === "object" ? body.profile : null;
  } catch {
    /* */
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 10) {
    return NextResponse.json({ ok: false, error: "Use at least 10 characters for your password." }, { status: 400 });
  }

  if (!profile || typeof profile.fullName !== "string") {
    return NextResponse.json({ ok: false, error: "Your name is required to create an account." }, { status: 400 });
  }
  const nameErr = validateProfileDisplayName(profile.fullName);
  if (nameErr) {
    return NextResponse.json({ ok: false, error: nameErr }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ ok: false, error: "An account already exists for that email. Try signing in." }, { status: 409 });
  }

  const uid = uidFromEmail(email);
  await upsertUser(email, hashPassword(password));

  if (deviceId) {
    const reg = await registerAccountDevice(uid, deviceId, deviceName, 2);
    if (!reg.ok) {
      return NextResponse.json(
        { ok: false, error: "You can only use SeaLink on 2 devices at once. Deactivate one to continue.", devices: reg.devices },
        { status: 409 },
      );
    }
  }

  if (profile) {
    const ageRaw = profile.age;
    const ageNum = typeof ageRaw === "number" ? ageRaw : typeof ageRaw === "string" ? parseInt(ageRaw, 10) : NaN;
    await upsertProfileAfterSignUp(uid, {
      fullName: typeof profile.fullName === "string" ? profile.fullName : undefined,
      boatName: typeof profile.boatName === "string" ? profile.boatName : undefined,
      phone: typeof profile.phone === "string" ? normalisePhone(profile.phone) : undefined,
      age: Number.isFinite(ageNum) ? ageNum : null,
      line1: typeof profile.line1 === "string" ? profile.line1 : undefined,
      line2: typeof profile.line2 === "string" ? profile.line2 : undefined,
      city: typeof profile.city === "string" ? profile.city : undefined,
      postcode: typeof profile.postcode === "string" ? profile.postcode : undefined,
      invitedEmails: typeof profile.invitedEmails === "string" ? profile.invitedEmails : undefined,
      locationAccess: typeof profile.locationAccess === "string" ? profile.locationAccess : undefined,
      avatarDataUrl: typeof profile.avatarDataUrl === "string" ? profile.avatarDataUrl : null,
    });
  }

  /** Do not set session cookies here — user must sign in next, then the app can send them to plans/payment. */
  return NextResponse.json({ ok: true as const });
}
