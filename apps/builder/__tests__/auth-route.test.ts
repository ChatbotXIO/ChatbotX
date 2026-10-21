// @vitest-environment node

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
} = vi.hoisted(() => ({
  defaultHandler: vi.fn(() => new Response("default")),
  hasEnterpriseFeatures: vi.fn(),
  mockGetSocialAuthForTenant: vi.fn(),
  mockResolveOAuthStateCallbackURL: vi.fn(),
  mockResolveRelayTarget: vi.fn(),
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantFromOAuthState: vi.fn(),
  socialHandler: vi.fn(() => new Response("social")),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
  isGenericOAuthPath: (pathname: string) =>
    pathname.endsWith("/sign-in/oauth2") ||
    pathname.endsWith("/oauth2/link") ||
    pathname.includes("/oauth2/callback/"),
  SOCIAL_PROVIDERS: ["google", "facebook"] as const,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantFromOAuthState: mockResolveTenantFromOAuthState,
  resolveOAuthStateCallbackURL: mockResolveOAuthStateCallbackURL,
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

beforeEach(() => {
  vi.clearAllMocks()
  hasEnterpriseFeatures.mockResolvedValue(true)
  mockGetSocialAuthForTenant.mockResolvedValue({ handler: socialHandler })
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

  test("returns 404 for generic OAuth when enterprise features are unavailable", async () => {
    hasEnterpriseFeatures.mockResolvedValue(false)

    const response = await GET(
      new Request(
        `https://${PLATFORM_HOST}/api/auth/sign-in/oauth2?providerId=oidc`,
      ),
    )

    expect(response.status).toBe(404)
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
