/**
 * Browser-only: downscale and re-encode profile photos so they stay under map/localStorage limits.
 */
const TARGET_MAX_BYTES = 420_000;
const MAX_EDGE_PX = 1600;
const MIN_EDGE_PX = 480;
const MIME_JPEG = "image/jpeg";

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
 * Returns a JPEG (or PNG if the source likely needs alpha — skipped for photos) under TARGET_MAX_BYTES when possible.
 */
export async function compressProfilePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= TARGET_MAX_BYTES && file.size <= 2 * 1024 * 1024) {
    const img = await loadImage(file);
    if (Math.max(img.naturalWidth, img.naturalHeight) <= MAX_EDGE_PX) return file;
  }

  const img = await loadImage(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.9;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    blob = await canvasToBlob(canvas, MIME_JPEG, quality);
    if (blob.size <= TARGET_MAX_BYTES) break;
    quality -= 0.08;
    if (quality < 0.35) break;
  }

  if (!blob || blob.size > TARGET_MAX_BYTES * 1.15) {
    let edge = Math.min(w, h);
    while (edge > MIN_EDGE_PX && (!blob || blob.size > TARGET_MAX_BYTES)) {
      edge = Math.round(edge * 0.85);
      const ratio = edge / Math.max(w, h);
      const nw = Math.max(1, Math.round(w * ratio));
      const nh = Math.max(1, Math.round(h * ratio));
      canvas.width = nw;
      canvas.height = nh;
      ctx.drawImage(img, 0, 0, nw, nh);
      quality = 0.82;
      for (let j = 0; j < 8; j++) {
        blob = await canvasToBlob(canvas, MIME_JPEG, quality);
        if (blob.size <= TARGET_MAX_BYTES) break;
        quality -= 0.1;
      }
      w = nw;
      h = nh;
      if (blob && blob.size <= TARGET_MAX_BYTES) break;
    }
  }

  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "profile";
  return new File([blob], `${base}.jpg`, { type: MIME_JPEG });
}
