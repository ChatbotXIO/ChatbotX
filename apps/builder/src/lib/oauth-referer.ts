import { customDomainService } from "@chatbotx.io/business"
import { env } from "@/env"
import { getBrokerOrigin } from "./oauth-broker"

export const FALLBACK_REDIRECT = "/manage"

/**
 * A valid relay/redirect target is any origin we control: the broker host, the
 * builder app URL, or an active white-label custom domain. Anything else is
 * rejected so an attacker-controlled `state` (or a spoofed `Host` /
 * `x-forwarded-host`) cannot drive an open redirect.
 */
export async function isAllowedOrigin(targetUrl: URL): Promise<boolean> {
  if (
    targetUrl.origin === getBrokerOrigin() ||
    targetUrl.origin === new URL(env.NEXT_PUBLIC_BUILDER_URL).origin
  ) {
    return true
  }
  const customDomain = await customDomainService.findActiveByDomain(
    targetUrl.hostname,
  )
  return Boolean(customDomain)
}

/**
 * Validate the `referer` carried in the OAuth `state` before redirecting to it.
 * Accepts the broker origin, the builder origin, and any active custom domain;
 * anything else falls back to a safe in-app path.
 */
export async function sanitizeReferer(referer: string): Promise<string> {
  try {
    const refererUrl = new URL(referer)
    return (await isAllowedOrigin(refererUrl)) ? referer : FALLBACK_REDIRECT
  } catch {
    return FALLBACK_REDIRECT
  }
}

/**
 * Social (Google/Facebook) and integration (TikTok/…) OAuth always land on the
 * fixed broker host — the only registered redirect_uri. When the flow originated
 * on a different domain (a reseller custom domain or the builder app URL), return
 * the URL to relay the callback to — same path + query, on the originating domain
 * — so the rest of the handler runs where the user's session cookie lives.
 *
 * Returns `null` when no relay is needed: the callback already ran on the
 * originating domain, or the `referer` is not an origin we control.
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

  const brokerHost = new URL(getBrokerOrigin()).host
  // Only relay from the broker host, and never to the broker itself.
  if (url.host !== brokerHost || refererUrl.host === brokerHost) {
    return null
  }

  if (!(await isAllowedOrigin(refererUrl))) {
    return null
  }

  return new URL(`${url.pathname}${url.search}`, refererUrl.origin).toString()
}
