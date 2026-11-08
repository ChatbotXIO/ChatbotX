/**
 * Non-standard MIME types some clients and hosts send, mapped to the registered
 * type. Meta (WhatsApp, Messenger, Instagram) fetches a media link and checks
 * the `Content-Type` it is served with — an object stored as `image/jpg` is
 * rejected (WhatsApp error 131053) even though its bytes are a valid JPEG.
 */
const MIME_TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
}

/**
 * Lowercases the base type and replaces a known non-standard alias with its
 * registered type, keeping any parameters (`; charset=utf-8`). Unknown types
 * pass through unchanged.
 */
export function normalizeMimeType(mimeType: string): string {
  const separator = mimeType.indexOf(";")
  const base = (separator === -1 ? mimeType : mimeType.slice(0, separator))
    .trim()
    .toLowerCase()
  const params = separator === -1 ? "" : mimeType.slice(separator)
  return `${MIME_TYPE_ALIASES[base] ?? base}${params}`
}
