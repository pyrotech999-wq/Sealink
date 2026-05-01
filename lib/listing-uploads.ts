import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { uploadPublicImage } from "@/lib/supabase/storage";

function extFromContentType(ct: string): string | null {
  const c = ct.toLowerCase();
  if (c === "image/jpeg" || c === "image/jpg") return "jpg";
  if (c === "image/png") return "png";
  if (c === "image/webp") return "webp";
  return null;
}

export type ImagePart = { buffer: Buffer; contentType: string };

/**
 * Persist listing images to Supabase Storage or `public/uploads` and return public URLs/paths.
 */
export async function persistListingImages(kind: "vessel" | "gear", listingId: string, parts: ImagePart[]): Promise<string[]> {
  const urls: string[] = [];
  if (isSupabaseConfigured()) {
    const prefix = kind === "vessel" ? "vessels" : "gear";
    for (const p of parts) {
      const ext = extFromContentType(p.contentType) ?? "jpg";
      const name = `${randomUUID()}.${ext}`;
      const storagePath = `${prefix}/${listingId}/${name}`;
      const url = await uploadPublicImage(storagePath, p.buffer, p.contentType || "image/jpeg");
      urls.push(url);
    }
    return urls;
  }

  const dirSeg = kind === "vessel" ? "vessels" : "gear";
  const dir = path.join(process.cwd(), "public", "uploads", dirSeg, listingId);
  mkdirSync(dir, { recursive: true });
  for (const p of parts) {
    const ext = extFromContentType(p.contentType) ?? "jpg";
    const name = `${randomUUID()}.${ext}`;
    const fp = path.join(dir, name);
    writeFileSync(fp, p.buffer);
    urls.push(`/uploads/${dirSeg}/${listingId}/${name}`);
  }
  return urls;
}
