import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { attachSenderProfilesToMessages } from "@/lib/message-sender-profiles";
import { appendVicinityMessage, listVicinityMessages } from "@/lib/vicinity-dm-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const peerUid = (url.searchParams.get("peerUid") ?? "").trim();
  if (!peerUid || peerUid === viewerUid) {
    return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
  }

  try {
    const { threadId, messages } = await listVicinityMessages(viewerUid, peerUid);
    const enriched = await attachSenderProfilesToMessages(messages);
    return NextResponse.json({ threadId, messages: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load messages";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = { peerUid?: unknown; text?: unknown };

export async function POST(req: Request) {
  let viewerUid: string;
  try {
    viewerUid = (await requireAuthUser()).uid;
  } catch {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const peerUid = typeof body.peerUid === "string" ? body.peerUid.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  if (!peerUid || peerUid === viewerUid) {
    return NextResponse.json({ error: "Invalid peer" }, { status: 400 });
  }

  const out = await appendVicinityMessage(viewerUid, peerUid, text);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true as const });
}
