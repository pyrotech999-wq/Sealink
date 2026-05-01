import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "site-uploads";

/** Public URL for an object in `site-uploads` bucket. */
export function publicObjectUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${p}`;
}

export async function uploadPublicImage(path: string, bytes: Buffer, contentType: string): Promise<string> {
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return publicObjectUrl(path);
}
