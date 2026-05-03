/**
 * Browser-only: downscale and re-encode profile photos.
 * Default: output JPEG **≤ 5MB**. Use a smaller `maxBytes` for tight localStorage data URLs.
 */

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Binary cap so base64 data URLs stay under ~450k chars in `map-profile-storage`. */
export const PROFILE_PHOTO_LOCAL_STORAGE_MAX_BYTES = 330_000;

const MAX_EDGE_PX = 2400;
const MIN_EDGE_PX = 360;
const MIME_JPEG = "image/jpeg";

export type CompressProfilePhotoOptions = {
  maxBytes?: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Could not encode image"));
      },
      type,
      quality,
    );
  });
}

/**
 * Returns a JPEG at or under `maxBytes` (default 5MB). Large picks are resized automatically.
 */
export async function compressProfilePhoto(file: File, options?: CompressProfilePhotoOptions): Promise<File> {
  const maxBytes = options?.maxBytes ?? PROFILE_PHOTO_MAX_BYTES;
  if (!file.type.startsWith("image/")) return file;

  const img = await loadImage(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w < 1 || h < 1) return file;

  if (file.size <= maxBytes && Math.max(w, h) <= MAX_EDGE_PX) {
    return file;
  }

  let scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  const draw = () => {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  };
  draw();

  const bestBlobAtQuality = async (): Promise<Blob> => {
    let q = 0.92;
    let best: Blob | null = null;
    for (let i = 0; i < 20; i++) {
      const b = await canvasToBlob(canvas, MIME_JPEG, q);
      if (b.size <= maxBytes) return b;
      if (!best || b.size < best.size) best = b;
      q -= 0.045;
      if (q < 0.22) break;
    }
    return best ?? (await canvasToBlob(canvas, MIME_JPEG, 0.22));
  };

  let blob = await bestBlobAtQuality();
  while (blob.size > maxBytes && Math.max(w, h) > MIN_EDGE_PX) {
    w = Math.max(1, Math.round(w * 0.87));
    h = Math.max(1, Math.round(h * 0.87));
    draw();
    blob = await bestBlobAtQuality();
  }

  if (blob.size > maxBytes) {
    const ratio = Math.min(MIN_EDGE_PX / w, MIN_EDGE_PX / h, 1);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
    draw();
    blob = await canvasToBlob(canvas, MIME_JPEG, 0.2);
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "profile";
  return new File([blob], `${base}.jpg`, { type: MIME_JPEG });
}
