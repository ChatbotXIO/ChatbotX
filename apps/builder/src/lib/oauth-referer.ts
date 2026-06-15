import { customDomainService } from "@chatbotx.io/business"
import { env } from "@/env"

export const FALLBACK_REDIRECT = "/manage"

/**
 * Validate the `referer` carried in the OAuth `state` before redirecting to it.
 * Accepts the platform origin and any active white-label custom domain; anything
 * else falls back to a safe in-app path so an attacker-controlled `state` cannot
 * drive an open redirect.
 */
export async function sanitizeReferer(referer: string): Promise<string> {
  try {
    const refererUrl = new URL(referer)
    const builderOrigin = new URL(env.NEXT_PUBLIC_BUILDER_URL).origin
    if (refererUrl.origin === builderOrigin) {
      return referer
    }
    const customDomain = await customDomainService.findActiveByDomain(
      refererUrl.hostname,
    )
    return customDomain ? referer : FALLBACK_REDIRECT
  } catch {
    return FALLBACK_REDIRECT
  }
}

/**
 * Facebook/TikTok OAuth always lands on the fixed platform callback (the only
 * registered redirect_uri). When the flow originated on a branded custom domain,
 * return the URL to relay the callback to — same path + query, on the originating
 * domain — so the rest of the handler runs where the user's session cookie lives.
 *
 * Returns `null` when no relay is needed: the callback already ran on the
 * originating domain, or the `referer` is not an active custom domain.
 */
export async function resolveRelayTarget(
  url: URL,
  referer: string,
): Promise<string | null> {
  let refererUrl: URL
  try {
    refererUrl = new URL(referer)
  } catch {
    return null
  }

  const platformHost = new URL(env.NEXT_PUBLIC_BUILDER_URL).host
  if (url.host !== platformHost || refererUrl.host === platformHost) {
    return null
  }

  const customDomain = await customDomainService.findActiveByDomain(
    refererUrl.hostname,
  )
  if (!customDomain) {
    return null
  }

  return new URL(`${url.pathname}${url.search}`, refererUrl.origin).toString()
}
