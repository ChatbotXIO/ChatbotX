/** Client-side cookie write for UI preferences (path=/); server reads it via next/headers cookies(). */
export function setClientCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not available in all supported browsers
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}`
}
