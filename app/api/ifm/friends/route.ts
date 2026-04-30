import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { addIfmFriend, listIfmFriends, removeIfmFriend } from "@/lib/ifm-friends-store";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await requireAuthUser();
  const friends = await listIfmFriends(user.uid);
  return NextResponse.json({ friends });
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireAuthUser();
  let body: unknown = null;
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = null;
  }
  const contact = body && typeof body === "object" && "contact" in body ? (body as any).contact : "";
  if (typeof contact !== "string") return NextResponse.json({ ok: false, error: "Enter a contact." }, { status: 400 });
  const res = await addIfmFriend(user.uid, contact);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await requireAuthUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const value = url.searchParams.get("value");
  if ((kind !== "email" && kind !== "phone") || !value) {
    return NextResponse.json({ ok: false, error: "kind and value required" }, { status: 400 });
  }
  const friends = await removeIfmFriend(user.uid, kind, value);
  return NextResponse.json({ ok: true, friends });
}

