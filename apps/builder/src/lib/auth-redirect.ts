import {
  getPublicHostFromRequest,
  getPublicProtocolFromRequest,
} from "@chatbotx.io/utils"
import { env } from "@/env"
import { getBrokerOrigin } from "./oauth-broker"
import { isAllowedOrigin } from "./oauth-referer"

const isRedirect = (status: number): boolean => status >= 300 && status < 400

/**
 * Re-home a better-auth verification redirect onto the white-label domain the
 * user is actually on.
 *
 * better-auth resolves the post-verification redirect target (magic-link/verify,
 * verify-email, reset-password) against its fixed `baseURL` — pinned to
 * `BETTER_AUTH_URL` (= the builder URL). So a user who clicked the link on a
 * reseller's custom domain is bounced to the builder host, losing the brand and,
 * worse, the freshly-minted session cookie scoped to that host. The email link's
 * host is already rewritten when sent (`@chatbotx.io/auth` server.ts); this is the
 * matching fix for the *redirect* leg.
 *
 * Only a 3xx whose `Location` origin is the builder or broker origin (i.e. a
 * `baseURL`-resolved callback) is rewritten, and only when the request's public
 * host is a controlled origin (active custom domain / builder / broker). Both
 * guards keep a spoofed `Host` / `x-forwarded-host` from driving an open
 * redirect, and make this a no-op on single-domain deploys (public host already
 * equals the builder host). `Set-Cookie` is preserved across the rewrite.
 */
export async function rewriteAuthRedirectToPublicHost(
  request: Request,
  response: Response,
): Promise<Response> {
  if (!isRedirect(response.status)) {
    return response
  }

  const location = response.headers.get("location")
  if (!location) {
    return response
  }

  const builderOrigin = new URL(env.NEXT_PUBLIC_BUILDER_URL).origin
  let target: URL
  try {
    // better-auth emits absolute Locations; the base only resolves a relative one
    // (which still belongs to the builder origin and so is eligible to re-home).
    target = new URL(location, builderOrigin)
  } catch {
    return response
  }

  if (target.origin !== builderOrigin && target.origin !== getBrokerOrigin()) {
    return response
  }

  const publicHost = getPublicHostFromRequest(request)
  if (publicHost === target.host) {
    return response
  }

  const publicProtocol = getPublicProtocolFromRequest(request)
  const publicOrigin = `${publicProtocol}://${publicHost}`
  if (!(await isAllowedOrigin(new URL(publicOrigin)))) {
    return response
  }

  target.host = publicHost
  target.protocol = publicProtocol
  target.port = ""

  const headers = new Headers(response.headers)
  headers.set("location", target.toString())
  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
