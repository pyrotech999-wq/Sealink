export async function GET() {
  return Response.json({ ok: true, peers: [] });
}

export async function POST() {
  return Response.json({ ok: true });
}
