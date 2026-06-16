// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const PLATFORM_URL = "https://app.example.com"

const { mockFindActiveByDomain } = vi.hoisted(() => ({
  mockFindActiveByDomain: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: {
    findActiveByDomain: mockFindActiveByDomain,
  },
}))

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BUILDER_URL: PLATFORM_URL,
  },
}))

const activeDomain = { id: "1", domain: "chat.acme.com", status: "active" }

async function loadModule() {
  return await import("@/lib/oauth-referer")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sanitizeReferer", () => {
  test("accepts the platform origin without a custom-domain lookup", async () => {
    const { sanitizeReferer } = await loadModule()

    const referer = `${PLATFORM_URL}/space/42/dashboard`
    expect(await sanitizeReferer(referer)).toBe(referer)
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("accepts a referer that maps to an active custom domain", async () => {
    mockFindActiveByDomain.mockResolvedValue(activeDomain)
    const { sanitizeReferer } = await loadModule()

    const referer = "https://chat.acme.com/space/42/dashboard"
    expect(await sanitizeReferer(referer)).toBe(referer)
    expect(mockFindActiveByDomain).toHaveBeenCalledWith("chat.acme.com")
  })

  test("falls back when the referer is not an active custom domain", async () => {
    mockFindActiveByDomain.mockResolvedValue(undefined)
    const { sanitizeReferer, FALLBACK_REDIRECT } = await loadModule()

    expect(await sanitizeReferer("https://evil.example.org/steal")).toBe(
      FALLBACK_REDIRECT,
    )
  })

  test("falls back when the referer is not a valid URL", async () => {
    const { sanitizeReferer, FALLBACK_REDIRECT } = await loadModule()

    expect(await sanitizeReferer("not-a-url")).toBe(FALLBACK_REDIRECT)
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })
})

describe("resolveRelayTarget", () => {
  test("relays to the originating custom domain, preserving path and query", async () => {
    mockFindActiveByDomain.mockResolvedValue(activeDomain)
    const { resolveRelayTarget } = await loadModule()

    const callbackUrl = new URL(
      `${PLATFORM_URL}/integrations/messenger/callback?code=abc&state=xyz`,
    )
    const referer = "https://chat.acme.com/space/42/dashboard"

    expect(await resolveRelayTarget(callbackUrl, referer)).toBe(
      "https://chat.acme.com/integrations/messenger/callback?code=abc&state=xyz",
    )
  })

  test("does not relay when the callback already ran on the originating domain", async () => {
    const { resolveRelayTarget } = await loadModule()

    const callbackUrl = new URL(
      "https://chat.acme.com/integrations/messenger/callback?code=abc",
    )
    const referer = "https://chat.acme.com/space/42/dashboard"

    expect(await resolveRelayTarget(callbackUrl, referer)).toBeNull()
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("does not relay when the referer is the platform itself", async () => {
    const { resolveRelayTarget } = await loadModule()

    const callbackUrl = new URL(
      `${PLATFORM_URL}/integrations/messenger/callback?code=abc`,
    )
    const referer = `${PLATFORM_URL}/space/42/dashboard`

    expect(await resolveRelayTarget(callbackUrl, referer)).toBeNull()
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("does not relay to an unknown (non-active) domain", async () => {
    mockFindActiveByDomain.mockResolvedValue(undefined)
    const { resolveRelayTarget } = await loadModule()

    const callbackUrl = new URL(
      `${PLATFORM_URL}/integrations/messenger/callback?code=abc`,
    )
    const referer = "https://evil.example.org/space/42/dashboard"

    expect(await resolveRelayTarget(callbackUrl, referer)).toBeNull()
  })

  test("returns null for an invalid referer", async () => {
    const { resolveRelayTarget } = await loadModule()

    const callbackUrl = new URL(
      `${PLATFORM_URL}/integrations/messenger/callback?code=abc`,
    )

    expect(await resolveRelayTarget(callbackUrl, "not-a-url")).toBeNull()
  })
})

describe("with a dedicated broker host", () => {
  const BROKER_URL = "https://auth.broker.example"

  async function loadWithBroker() {
    vi.resetModules()
    vi.doMock("@/env", () => ({
      env: {
        NEXT_PUBLIC_BUILDER_URL: PLATFORM_URL,
        NEXT_PUBLIC_OAUTH_BROKER_URL: BROKER_URL,
      },
    }))
    return await import("@/lib/oauth-referer")
  }

  test("sanitizeReferer accepts the broker origin without a lookup", async () => {
    const { sanitizeReferer } = await loadWithBroker()

    const referer = `${BROKER_URL}/welcome`
    expect(await sanitizeReferer(referer)).toBe(referer)
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("sanitizeReferer accepts the builder origin without a lookup", async () => {
    const { sanitizeReferer } = await loadWithBroker()

    const referer = `${PLATFORM_URL}/space/42/dashboard`
    expect(await sanitizeReferer(referer)).toBe(referer)
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("relays from the broker host to the builder URL (a valid target)", async () => {
    const { resolveRelayTarget } = await loadWithBroker()

    const callbackUrl = new URL(
      `${BROKER_URL}/api/auth/callback/google?code=abc&state=xyz`,
    )
    const referer = `${PLATFORM_URL}/space/42/dashboard`

    expect(await resolveRelayTarget(callbackUrl, referer)).toBe(
      `${PLATFORM_URL}/api/auth/callback/google?code=abc&state=xyz`,
    )
    expect(mockFindActiveByDomain).not.toHaveBeenCalled()
  })

  test("relays from the broker host to an active custom domain", async () => {
    mockFindActiveByDomain.mockResolvedValue(activeDomain)
    const { resolveRelayTarget } = await loadWithBroker()

    const callbackUrl = new URL(
      `${BROKER_URL}/integrations/tiktok/callback?code=abc&state=xyz`,
    )
    const referer = "https://chat.acme.com/space/42/dashboard"

    expect(await resolveRelayTarget(callbackUrl, referer)).toBe(
      "https://chat.acme.com/integrations/tiktok/callback?code=abc&state=xyz",
    )
  })

  test("does not relay from the builder host — only the broker host relays", async () => {
    mockFindActiveByDomain.mockResolvedValue(activeDomain)
    const { resolveRelayTarget } = await loadWithBroker()

    const callbackUrl = new URL(
      `${PLATFORM_URL}/integrations/tiktok/callback?code=abc`,
    )
    const referer = "https://chat.acme.com/space/42/dashboard"

    expect(await resolveRelayTarget(callbackUrl, referer)).toBeNull()
  })

  test("does not relay back to the broker itself", async () => {
    const { resolveRelayTarget } = await loadWithBroker()

    const callbackUrl = new URL(
      `${BROKER_URL}/integrations/tiktok/callback?code=abc`,
    )
    const referer = `${BROKER_URL}/welcome`

    expect(await resolveRelayTarget(callbackUrl, referer)).toBeNull()
  })
})
