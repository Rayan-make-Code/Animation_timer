/** Статические форматы, которые декодирует Chromium. GIF сознательно исключён. */
const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.avif']);

export function isSupportedImage(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return false;
  return SUPPORTED.has(fileName.slice(dot).toLowerCase());
}
