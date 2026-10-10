const JPEG_PREFIX = "/9j/"

/** Flow JSON images are bare base64; pick a mime type for the data URI. */
export const toImageSrc = (base64: unknown): string | undefined => {
  if (typeof base64 !== "string" || !base64) {
    return
  }
  const mime = base64.startsWith(JPEG_PREFIX) ? "image/jpeg" : "image/png"
  return `data:${mime};base64,${base64}`
}
