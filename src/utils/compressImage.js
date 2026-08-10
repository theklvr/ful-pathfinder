// Client-side compression before an admin-uploaded photo ever leaves the
// browser -- a phone camera photo can be 5-10MB raw, and sending that
// straight to a serverless function risks Vercel's request body limit
// (and is just wasteful). Uses the browser's built-in Canvas API, not a
// new dependency, matching the same target size/quality as
// scripts/prepare-photos.mjs's sharp-based compression.
const MAX_WIDTH = 1600;
const QUALITY = 0.78;

export async function compressImageToWebp(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))), 'image/webp', QUALITY);
  });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
