import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "./keys"

// Reachable only through the `./open-link-token` subpath, never from this
// package's barrel — exactly like `link-signature.ts`. The barrel is pulled into
// the builder's Edge bundle (middleware → oRPC router → business), where
// `node:crypto` is unsupported and the build warns.

export type OpenLinkParams = {
  workspaceId: string
  url: string
}

const serializeOpenLinkParams = (params: OpenLinkParams): string =>
  `${params.workspaceId}:${params.url}`

/**
 * Seal the destination of a deep-link interstitial (`/go/<workspaceId>`).
 *
 * HMAC rather than `encryptUtils.encryptObject`, and the choice is load-bearing:
 * `encryptObject` uses a random IV, so the same destination would produce a
 * different token — and therefore a different `/go` URL — on every send.
 * Facebook's crawler would then never have scraped the URL a contact taps, the
 * App Links meta tags would never be read, and the fix would be inert. An HMAC
 * is deterministic, so one destination always yields one URL and the crawler's
 * cache stays warm.
 *
 * `workspaceId` is part of the signed material, so a token minted for one
 * workspace cannot be replayed on another workspace's path.
 */
export const signOpenLinkUrl = (params: OpenLinkParams): string =>
  createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY, "hex"))
    .update(serializeOpenLinkParams(params))
    .digest("hex")

export const verifyOpenLinkUrl = (
  params: OpenLinkParams,
  signature: string | null | undefined,
): boolean => {
  if (!signature) {
    return false
  }

  const expected = signOpenLinkUrl(params)
  const expectedBuffer = Buffer.from(expected, "hex")
  const actualBuffer = Buffer.from(signature, "hex")

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
