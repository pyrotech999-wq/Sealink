import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { getMarinaById } from "@/lib/marina-catalog";
import { createMarinaBerthRequest, listMarinaBerthRequestsForUser } from "@/lib/marina-berth-requests-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";

const NOTE_MAX = 2000;

function parseISODateOnly(s: string): string | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

export async function GET(): Promise<Response> {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ requests: [], persistence: false });
  }

  try {
    const requests = await listMarinaBerthRequestsForUser(user.uid);
    return NextResponse.json({ requests, persistence: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = {
  marinaId?: unknown;
  arrival?: unknown;
  departure?: unknown;
  boatLengthM?: unknown;
  note?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Saving requests needs Supabase. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run migration 004_marina_berth_requests.sql, then try again — or copy your enquiry and call the marina.",
      },
      { status: 503 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const marinaId = typeof body.marinaId === "string" ? body.marinaId.trim() : "";
  const arrivalRaw = typeof body.arrival === "string" ? body.arrival : "";
  const departureRaw = typeof body.departure === "string" ? body.departure : "";
  const noteRaw = typeof body.note === "string" ? body.note : "";

  const marina = getMarinaById(marinaId);
  if (!marina) return NextResponse.json({ error: "Unknown marina" }, { status: 400 });

  const arrival = parseISODateOnly(arrivalRaw);
  const departure = parseISODateOnly(departureRaw);
  if (!arrival || !departure) {
    return NextResponse.json({ error: "Arrival and departure must be valid dates (YYYY-MM-DD)." }, { status: 400 });
  }
  if (arrival >= departure) {
    return NextResponse.json({ error: "Departure must be after arrival." }, { status: 400 });
  }

  let boatLengthM: number | null = null;
  if (body.boatLengthM !== undefined && body.boatLengthM !== null && body.boatLengthM !== "") {
    const n = typeof body.boatLengthM === "number" ? body.boatLengthM : Number(body.boatLengthM);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "Boat length must be a positive number (metres)." }, { status: 400 });
    }
    if (n > marina.maxLengthM) {
      return NextResponse.json(
        { error: `This marina lists a maximum length of ${marina.maxLengthM} m. Adjust length or pick another harbour.` },
        { status: 400 },
      );
    }
    boatLengthM = n;
  }

  const note = noteRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, NOTE_MAX);

  try {
    const row = await createMarinaBerthRequest({
      userUid: user.uid,
      userEmail: user.email,
      marinaId: marina.id,
      marinaName: marina.name,
      marinaPhone: marina.phone,
      arrival,
      departure,
      boatLengthM,
      note,
    });
    return NextResponse.json({ ok: true, request: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    if (msg.includes("foreign key") || msg.includes("23503")) {
      return NextResponse.json(
        {
          error:
            "Your sign-in account is not in the database yet. Create an account on this site (or run user migration) so berth requests can be saved.",
        },
        { status: 400 },
      );
    }
    if (msg.includes("marina_berth_requests") || msg.includes("does not exist")) {
      return NextResponse.json(
        { error: "Database table missing. Run supabase/migrations/004_marina_berth_requests.sql on your project." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
