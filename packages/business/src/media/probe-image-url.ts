import { fetchFollowingSafeRedirects } from "@chatbotx.io/filesystem"
import { getChildLogger } from "@chatbotx.io/logger"
import { assertPublicUrl } from "../net/ssrf-guard"

const logger = getChildLogger("business:probe-image-url")

const PROBE_TIMEOUT_MS = 5000
const IMAGE_MIME_PREFIX = "image/"

const redirectErrors = {
  invalidRedirectLocation: (location: string) =>
    new Error(`Invalid redirect location: ${location}`),
  noLocationHeader: () => new Error("Redirect response has no Location header"),
  tooManyRedirects: () => new Error("Too many redirects while probing image"),
}

const baseMimeType = (contentType: string | null): string | null =>
  contentType ? (contentType.split(";")[0] ?? "").trim().toLowerCase() : null

const request = async (
  url: string,
  init: { headers?: Record<string, string>; method: "GET" | "HEAD" },
): Promise<Response> => {
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  const { response } = await fetchFollowingSafeRedirects({
    errors: redirectErrors,
    fetchImpl: (candidateUrl) =>
      fetch(candidateUrl, { ...init, redirect: "manual", signal }),
    url,
    validateUrl: (candidateUrl) => assertPublicUrl(candidateUrl, "Image URL"),
  })
  return response
}

/**
 * The `image/*` type `url` is served as, or `null` when it is not a public
 * `http(s)` link to an image (or cannot be reached). For links whose path has
 * no file extension — WhatsApp media is stored under a bare id — where the
 * `Content-Type` is the only thing that says it is an image.
 *
 * Asks with HEAD first; a host that rejects HEAD is asked again with a
 * one-byte ranged GET. Every redirect hop is SSRF-checked. Never throws.
 */
export const probeImageMimeType = async (
  url: string,
): Promise<string | null> => {
  try {
    let response = await request(url, { method: "HEAD" })
    if (!response.ok) {
      response = await request(url, {
        headers: { Range: "bytes=0-0" },
        method: "GET",
      })
    }
    // Only the headers are needed; release the connection without reading.
    await response.body?.cancel().catch(() => undefined)
    if (!response.ok) {
      return null
    }
    const mimeType = baseMimeType(response.headers.get("content-type"))
    return mimeType?.startsWith(IMAGE_MIME_PREFIX) ? mimeType : null
  } catch (err) {
    logger.warn({ err }, "Unable to probe image URL")
    return null
  }
}
