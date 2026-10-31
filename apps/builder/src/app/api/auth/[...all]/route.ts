import {
  isGenericOAuthPath,
  isSharedSocialPath,
  SOCIAL_PROVIDERS,
  type SocialProvider,
  warnIfGenericOAuthUnlicensed,
} from "@chatbotx.io/auth/server"
import {
  resolveOAuthStateCallbackURL,
  resolveTenantByDomain,
  resolveTenantFromOAuthState,
  withTenant,
} from "@chatbotx.io/auth/tenant"
import { hasEnterpriseFeatures } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { auth } from "@/lib/auth/auth"
import { getSocialAuthForTenant } from "@/lib/auth/auth-instances"
import { rewriteAuthRedirectToPublicHost } from "@/lib/auth-redirect"
import { resolveRelayTarget } from "@/lib/oauth-referer"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"

const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version",
} as const

const retryAfterPattern = /Retry after (\d+)s\./

const withMcpCors = (pathname: string, response: Response): Response => {
  if (!pathname.includes("/api/auth/oauth2/")) {
    return response
  }

  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

/**
 * Run the better-auth pipeline inside the tenant bound to the request's branded
 * domain, so end-customer sign-in / sign-up / reset / verification resolve users
 * within that reseller's tenant (or the platform when no custom domain matches).
 *
 * The reseller that owns a custom domain can also sign in on that domain: when a
 * scoped lookup misses, the adapter falls back to the tenant owner (`Tenant.ownerId`,
 * root-tenant row only). So a reseller signs into the builder on both the platform URL and
 * their own domain; their sub-accounts only on the reseller's domain. This
 * fallback applies to every auth method, including OAuth social sign-in — see
 * the findOne reseller-owner fallback in `@chatbotx.io/auth` `server.ts`.
 *
 * OAuth still needs special tenant recovery: the provider redirects to a
 * redirect URI pinned per-credential (the reseller's own active custom domain
 * for a tenant-owned credential, else the broker host —
 * `NEXT_PUBLIC_BROKER_URL`, defaulting to the builder URL; see
 * `auth-instances.ts`), so on the `/callback/*` leg `x-domain` may not match
 * where the flow started. There we recover the tenant from the persisted
 * OAuth `state` instead — its `callbackURL` carries the originating reseller
 * origin. Without this, a social signup on a reseller domain would be created
 * in the root tenant. See `resolveTenantFromOAuthState`.
 *
 * Two further white-label concerns are handled here:
 *
 * 1. Relay — the registered callback host can differ from the *originating*
 *    branded host (inherited/platform credentials always land on the broker;
 *    a tenant-owned credential lands on the reseller's own domain even when
 *    the flow started on the platform host). Landing anywhere but the
 *    originating host mints the session cookie somewhere the user isn't, so
 *    on the `/callback/*` leg we bounce the callback (same code + state) back
 *    to that host before handling. Mirrors the Facebook/TikTok relay in
 *    `integrations/[...integration]`.
 *
 * 2. Per-tenant social apps — better-auth freezes social-provider config at init,
 *    so we dispatch the social/callback legs to a per-credential auth instance
 *    resolved for the bound tenant and provider (own app, else platform default).
 *    Every other route uses the default `auth` instance. See `auth-instances.ts`.
 *
 * 3. Verification redirect re-homing — better-auth resolves the post-verification
 *    redirect (magic-link/verify, verify-email, reset-password) against its fixed
 *    `baseURL` (the builder URL), so a user who clicked the link on a branded
 *    domain would be bounced to the builder host — losing the brand and the
 *    host-scoped session cookie just minted. We rewrite that redirect back onto
 *    the originating host. See `rewriteAuthRedirectToPublicHost`.
 */

/** The provider on a `/callback/<provider>` leg, or `null` if not a social callback. */
const getCallbackProvider = (pathname: string): SocialProvider | null =>
  SOCIAL_PROVIDERS.find((provider) =>
    pathname.endsWith(`/callback/${provider}`),
  ) ?? null

/**
 * Read the provider requested by a social sign-in, sign-up or link POST. The generic provider
 * shares this endpoint with first-party providers, so only the latter are
 * dispatched to a tenant-specific auth instance.
 */
const getRequestedSignInProvider = async (
  request: Request,
): Promise<string | null> => {
  try {
    const body = (await request.clone().json()) as { provider?: unknown }
    return typeof body.provider === "string" ? body.provider : null
  } catch {
    return null
  }
}

const isSocialProvider = (provider: string): provider is SocialProvider =>
  SOCIAL_PROVIDERS.includes(provider as SocialProvider)

const handle = async (request: Request): Promise<Response> => {
  // Use the public URL (host behind the proxy), not the raw internal request URL,
  // so the relay host comparison matches the registered platform host.
  const url = getPublicUrlFromRequest(request)
  const requestedSignInProvider = isSharedSocialPath(url.pathname)
    ? await getRequestedSignInProvider(request)
    : null

  if (isGenericOAuthPath(url.pathname, requestedSignInProvider ?? undefined)) {
    const isLicensed = await hasEnterpriseFeatures()
    warnIfGenericOAuthUnlicensed(isLicensed)
    if (!isLicensed) {
      return new Response(null, { status: 404 })
    }
  }

  const isCallback = url.pathname.includes("/callback/")
  const state = url.searchParams.get("state")
  const tenantId = isCallback
    ? await resolveTenantFromOAuthState(state)
    : await resolveTenantByDomain(request.headers.get("x-domain"))

  if (url.pathname.endsWith("/oauth2/register")) {
    try {
      await assertApiNotRateLimited({
        scope: "mcp-client-registration",
        key: getGuestClientIp(request.headers),
        limit: 20,
      })
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "tooManyRequests"
      ) {
        const retryAfter = error.message.match(retryAfterPattern)?.[1]
        const headers = new Headers()
        if (retryAfter) {
          headers.set("Retry-After", retryAfter)
        }
        return withMcpCors(
          url.pathname,
          Response.json(
            { error: error.message },
            { headers, status: error.httpStatusCode ?? 429 },
          ),
        )
      }
      throw error
    }
  }

  return withTenant(tenantId, async () => {
    if (isCallback) {
      const callbackURL = await resolveOAuthStateCallbackURL(state)
      const relayTarget = callbackURL
        ? await resolveRelayTarget(url, callbackURL)
        : null
      if (relayTarget) {
        return Response.redirect(relayTarget, 302)
      }
    }

    const provider =
      getCallbackProvider(url.pathname) ??
      (requestedSignInProvider && isSocialProvider(requestedSignInProvider)
        ? requestedSignInProvider
        : null)
    const instance = provider
      ? await getSocialAuthForTenant(tenantId, provider)
      : auth
    const response = await instance.handler(request)
    return withMcpCors(
      url.pathname,
      await rewriteAuthRedirectToPublicHost(request, response),
    )
  })
}

export const GET = handle
export const POST = handle

export const OPTIONS = (request: Request) => {
  const pathname = new URL(request.url).pathname
  if (!pathname.includes("/api/auth/oauth2/")) {
    return new Response(null, { status: 405 })
  }

  return new Response(null, {
    status: 204,
    headers: MCP_CORS_HEADERS,
  })
}
