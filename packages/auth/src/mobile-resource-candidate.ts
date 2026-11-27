import { getMobileApiAudience } from "./keys"

const JWT_SEGMENT_COUNT = 3

const decodeBase64Url = (segment: string): string => {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/")
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
}

/**
 * Reads the `aud` claim without verifying the signature. Consumers use this
 * only to select the resource server that performs full verification.
 */
export const peekJwtAudiences = (token: string): string[] => {
  const segments = token.split(".")
  if (segments.length !== JWT_SEGMENT_COUNT) {
    return []
  }
  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as {
      aud?: unknown
    }
    if (typeof payload.aud === "string") {
      return [payload.aud]
    }
    return Array.isArray(payload.aud)
      ? payload.aud.filter((aud): aud is string => typeof aud === "string")
      : []
  } catch {
    return []
  }
}

/** True when the token claims the mobile REST audience; the claim is unverified. */
export const isMobileAccessTokenCandidate = (token: string): boolean =>
  peekJwtAudiences(token).includes(getMobileApiAudience())
