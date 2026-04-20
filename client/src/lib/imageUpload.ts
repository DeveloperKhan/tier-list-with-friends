import i18n from '@/i18n';

const MAX_DIM = 120;
const QUALITY = 0.85;
// Safety cap after preprocessing — 100KB is generous for a 120px WebP tile
const MAX_UPLOAD_BYTES = 100_000;

// SVG and other vector formats can't be reliably rasterised via createImageBitmap.
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

/** Value for the <input accept="..."> attribute. */
export const ACCEPTED_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';

/** Human-readable format list for UI labels. */
export const ACCEPTED_LABEL = 'JPG, PNG, GIF, WebP, AVIF';

async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/webp',
      QUALITY,
    ),
  );
}

/** Resize, recompress, then upload to R2 via the Worker. Returns the imageId. */
export async function uploadImage(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(i18n.t('imageUpload.unsupportedFormat', { name: file.name, formats: ACCEPTED_LABEL }));
  }
  const blob = await preprocessImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(i18n.t('imageUpload.fileTooLarge', { name: file.name }));
  }

  const res = await fetch('/api/image/upload', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(i18n.t('imageUpload.uploadFailed', { message: msg }));
  }
  const { imageId } = (await res.json()) as { imageId: string };
  return imageId;
}
