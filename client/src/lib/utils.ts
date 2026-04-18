import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes without conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Item rendering helpers
// ---------------------------------------------------------------------------

/** Render a text string as a 120×120 canvas tile and return a data URI.
 *  Results are cached so repeated renders of the same text are free. */
const _textDataUrlCache = new Map<string, string>();
export function textToDataUrl(text: string): string {
  if (_textDataUrlCache.has(text)) return _textDataUrlCache.get(text)!;

  const size = 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e1e2e';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 12);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 12);
  ctx.stroke();

  const maxWidth = 100;
  let fontSize = 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px sans-serif`;
  while (ctx.measureText(text).width > maxWidth && fontSize > 9) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }
  ctx.fillText(text, size / 2, size / 2, maxWidth);

  const url = canvas.toDataURL('image/png');
  _textDataUrlCache.set(text, url);
  return url;
}

/** Return the display src for any item, regardless of kind. */
export function getItemSrc(item: { kind: string; dataUrl: string; imageUrl: string; text: string }): string {
  if (item.kind === 'tiermaker') {
    // img.src from Playwright gives full URLs; CSS background-image may give relative paths.
    // The sidecar /image proxy requires a full https://tiermaker.com/images/ URL.
    const url = item.imageUrl.startsWith('/')
      ? `https://tiermaker.com${item.imageUrl}`
      : item.imageUrl;
    return url;
  }
  if (item.kind === 'text') return textToDataUrl(item.text);
  return item.dataUrl;
}
