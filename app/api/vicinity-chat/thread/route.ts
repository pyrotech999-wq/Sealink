import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { deleteVicinityThread } from "@/lib/vicinity-dm-store";

export const runtime = "nodejs";

type Body = { threadId?: unknown };

export async function DELETE(req: Request) {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const out = await deleteVicinityThread(viewerUid, threadId);
  if (!out.ok) {
    const status = out.error === "Not allowed." ? 403 : out.error === "Thread not found." ? 404 : 400;
    return NextResponse.json({ error: out.error }, { status });
  }
  return NextResponse.json({ ok: true as const });
}
