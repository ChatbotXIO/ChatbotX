// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const PLATFORM_HOST = "app.example.com"
const RESELLER_HOST = "chat.acme.com"

const {
  mockResolveTenantByDomain,
  mockResolveTenantFromOAuthState,
  mockResolveOAuthStateCallbackURL,
  mockResolveRelayTarget,
  mockGetSocialAuthForTenant,
  defaultHandler,
  socialHandler,
} = vi.hoisted(() => ({
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantFromOAuthState: vi.fn(),
  mockResolveOAuthStateCallbackURL: vi.fn(),
  mockResolveRelayTarget: vi.fn(),
  mockGetSocialAuthForTenant: vi.fn(),
  defaultHandler: vi.fn(() => new Response("default")),
  socialHandler: vi.fn(() => new Response("social")),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
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
  // The route uses the public URL for host comparison; in tests the request URL
  // already carries the public host.
  getPublicUrlFromRequest: (request: Request) => new URL(request.url),
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: { handler: defaultHandler },
}))

vi.mock("@/lib/auth/auth-instances", () => ({
  getSocialAuthForTenant: mockGetSocialAuthForTenant,
}))

vi.mock("@/lib/oauth-referer", () => ({
  resolveRelayTarget: mockResolveRelayTarget,
}))

async function loadRoute() {
  vi.resetModules()
  return await import("@/app/api/auth/[...all]/route")
}

beforeEach(() => {
  vi.clearAllMocks()
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

    const { GET } = await loadRoute()
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

    const { GET } = await loadRoute()
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

    const { POST } = await loadRoute()
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
