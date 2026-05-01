import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { listVicinityInbox } from "@/lib/vicinity-dm-store";

export const runtime = "nodejs";

export async function GET() {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  try {
    const threads = await listVicinityInbox(viewerUid);
    return NextResponse.json({ threads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load inbox";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
