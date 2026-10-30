// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET, POST } from "@/app/api/auth/[...all]/route"

const PLATFORM_HOST = "app.example.com"
const RESELLER_HOST = "chat.acme.com"

const {
  defaultHandler,
  hasEnterpriseFeatures,
  mockGetSocialAuthForTenant,
  mockResolveOAuthStateCallbackURL,
  mockResolveRelayTarget,
  mockResolveTenantByDomain,
  mockResolveTenantFromOAuthState,
  socialHandler,
  warnIfGenericOAuthUnlicensed,
  assertApiNotRateLimited,
  getGuestClientIp,
} = vi.hoisted(() => ({
  defaultHandler: vi.fn(() => new Response("default")),
  hasEnterpriseFeatures: vi.fn(),
  mockGetSocialAuthForTenant: vi.fn(),
  mockResolveOAuthStateCallbackURL: vi.fn(),
  mockResolveRelayTarget: vi.fn(),
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantFromOAuthState: vi.fn(),
  socialHandler: vi.fn(() => new Response("social")),
  warnIfGenericOAuthUnlicensed: vi.fn(),
  assertApiNotRateLimited: vi.fn(),
  getGuestClientIp: vi.fn(() => "203.0.113.9"),
}))

// `isGenericOAuthPath`'s real logic is covered directly in
// `packages/auth/__tests__/generic-oauth-path.test.ts` (importing from the
// package avoids pulling the heavy `@chatbotx.io/auth/server` module graph —
// better-auth, drizzle, business — into this route test). This mock mirrors
// the generic callback and provider-specific shared social sign-in path.
vi.mock("@chatbotx.io/auth/server", () => ({
  isGenericOAuthPath: (pathname: string, provider?: string) =>
    pathname.endsWith("/callback/oidc") ||
    (provider === "oidc" &&
      (pathname.endsWith("/sign-in/social") ||
        pathname.endsWith("/sign-up/social"))),
  SOCIAL_PROVIDERS: ["google", "facebook"] as const,
  warnIfGenericOAuthUnlicensed,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveOAuthStateCallbackURL: mockResolveOAuthStateCallbackURL,
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantFromOAuthState: mockResolveTenantFromOAuthState,
  // Run the body immediately — tenant binding is exercised elsewhere.
  withTenant: (_tenantId: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  // The route uses the public URL for host comparison; in tests the request
  // URL already carries the public host.
  getPublicUrlFromRequest: (request: Request) => new URL(request.url),
}))

vi.mock("@chatbotx.io/business", () => ({ hasEnterpriseFeatures }))

vi.mock("@/lib/auth/auth", () => ({
  auth: { handler: defaultHandler },
}))

vi.mock("@/lib/auth/auth-instances", () => ({
  getSocialAuthForTenant: mockGetSocialAuthForTenant,
}))

vi.mock("@/lib/oauth-referer", () => ({
  resolveRelayTarget: mockResolveRelayTarget,
}))

// Redirect re-homing is exercised in auth-redirect.test.ts; here it is a
// pass-through so routing/relay assertions stay isolated.
vi.mock("@/lib/auth-redirect", () => ({
  rewriteAuthRedirectToPublicHost: (_request: Request, response: Response) =>
    response,
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp,
}))

async function loadRoute() {
  return await import("@/app/api/auth/[...all]/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  hasEnterpriseFeatures.mockResolvedValue(true)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  mockGetSocialAuthForTenant.mockResolvedValue({ handler: socialHandler })
  mockResolveTenantByDomain.mockResolvedValue("1")
})

describe("auth route — white-label relay", () => {
  test("relays the social callback from the platform host to the originating domain", async () => {
    mockResolveTenantFromOAuthState.mockResolvedValue("42")
    mockResolveOAuthStateCallbackURL.mockResolvedValue(
      `https://${RESELLER_HOST}/welcome`,
    )
    const relayTarget = `https://${RESELLER_HOST}/api/auth/callback/google?code=abc&state=xyz`
    mockResolveRelayTarget.mockResolvedValue(relayTarget)

    const response = await GET(
      new Request(
        `https://${PLATFORM_HOST}/api/auth/callback/google?code=abc&state=xyz`,
      ),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(relayTarget)
    expect(socialHandler).not.toHaveBeenCalled()
    expect(defaultHandler).not.toHaveBeenCalled()
  })

  test("on the originating host the callback falls through to the per-provider instance", async () => {
    mockResolveTenantFromOAuthState.mockResolvedValue("42")
    mockResolveOAuthStateCallbackURL.mockResolvedValue(
      `https://${RESELLER_HOST}/welcome`,
    )
    // Re-entry on the reseller host → no relay.
    mockResolveRelayTarget.mockResolvedValue(null)

    const response = await GET(
      new Request(
        `https://${RESELLER_HOST}/api/auth/callback/google?code=abc&state=xyz`,
      ),
    )

    expect(mockGetSocialAuthForTenant).toHaveBeenCalledWith("42", "google")
    expect(socialHandler).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe("social")
  })

  test("a non-social route uses the default auth instance and never relays", async () => {
    mockResolveTenantByDomain.mockResolvedValue("1")

    const response = await POST(
      new Request(`https://${RESELLER_HOST}/api/auth/get-session`, {
        method: "POST",
        headers: { "x-domain": RESELLER_HOST },
      }),
    )

    expect(mockResolveRelayTarget).not.toHaveBeenCalled()
    expect(mockGetSocialAuthForTenant).not.toHaveBeenCalled()
    expect(defaultHandler).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe("default")
  })
})

describe("auth route — generic OAuth enterprise gate", () => {
  test("gates the generic OAuth callback when enterprise features are unavailable", async () => {
    hasEnterpriseFeatures.mockResolvedValue(false)

    const response = await GET(
      new Request(`https://${PLATFORM_HOST}/api/auth/callback/oidc`),
    )

    expect(response.status).toBe(404)
    expect(defaultHandler).not.toHaveBeenCalled()
    expect(warnIfGenericOAuthUnlicensed).toHaveBeenCalledWith(false)
  })

  test("gates the generic provider on the shared social sign-in route", async () => {
    hasEnterpriseFeatures.mockResolvedValue(false)

    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/social`, {
        body: JSON.stringify({ provider: "oidc" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(404)
    expect(defaultHandler).not.toHaveBeenCalled()
  })

  test("does not gate a first-party provider on the shared social sign-in route", async () => {
    hasEnterpriseFeatures.mockResolvedValue(false)

    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/social`, {
        body: JSON.stringify({ provider: "google" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    )

    expect(response.status).not.toBe(404)
    expect(mockGetSocialAuthForTenant).toHaveBeenCalledWith("1", "google")
    expect(warnIfGenericOAuthUnlicensed).not.toHaveBeenCalled()
  })
})

describe("auth route — MCP browser responses", () => {
  test("adds CORS headers to the MCP token response", async () => {
    mockResolveTenantByDomain.mockResolvedValue("1")
    const { POST } = await loadRoute()

    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/oauth2/token`, {
        method: "POST",
      }),
    )

    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,POST,OPTIONS",
    )
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization, mcp-protocol-version",
    )
  })

  test("adds CORS and Retry-After to a rate-limited client registration", async () => {
    mockResolveTenantByDomain.mockResolvedValue("1")
    assertApiNotRateLimited.mockRejectedValue(
      new ChatbotXException(
        "Too many requests. Retry after 7s.",
        "tooManyRequests",
        429,
      ),
    )
    const { POST } = await loadRoute()

    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/oauth2/register`, {
        method: "POST",
      }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("retry-after")).toBe("7")
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests. Retry after 7s.",
    })
  })
})
