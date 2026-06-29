// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.example.com"
const RESELLER_HOST = "chat.acme.com"

const { mockIsAllowedOrigin } = vi.hoisted(() => ({
  mockIsAllowedOrigin: vi.fn(),
}))

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BUILDER_URL: BUILDER_URL },
}))

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BUILDER_URL,
}))

vi.mock("@/lib/oauth-referer", () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

// The proxy sets these from the forwarded headers; here we derive them from the
// request host so each case can drive the public host directly.
vi.mock("@chatbotx.io/utils", () => ({
  getPublicHostFromRequest: (request: Request) => new URL(request.url).host,
  getPublicProtocolFromRequest: (request: Request) =>
    new URL(request.url).protocol.replace(":", ""),
}))

async function loadModule() {
  return await import("@/lib/auth-redirect")
}

function verifyRequest(host: string): Request {
  return new Request(
    `https://${host}/api/auth/magic-link/verify?token=abc&callbackURL=/`,
  )
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { location },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("rewriteAuthRedirectToPublicHost", () => {
  test("re-homes a builder-origin redirect onto the branded host the user is on", async () => {
    mockIsAllowedOrigin.mockResolvedValue(true)
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = redirectTo(`${BUILDER_URL}/`)
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(RESELLER_HOST),
      response,
    )

    expect(rewritten.headers.get("location")).toBe(`https://${RESELLER_HOST}/`)
    expect(mockIsAllowedOrigin).toHaveBeenCalledWith(
      new URL(`https://${RESELLER_HOST}`),
    )
  })

  test("preserves the Set-Cookie session header across the rewrite", async () => {
    mockIsAllowedOrigin.mockResolvedValue(true)
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = new Response(null, {
      status: 302,
      headers: {
        location: `${BUILDER_URL}/dashboard`,
        "set-cookie": "better-auth.session_token=secret; Path=/; HttpOnly",
      },
    })
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(RESELLER_HOST),
      response,
    )

    expect(rewritten.headers.get("location")).toBe(
      `https://${RESELLER_HOST}/dashboard`,
    )
    expect(rewritten.headers.get("set-cookie")).toBe(
      "better-auth.session_token=secret; Path=/; HttpOnly",
    )
  })

  test("leaves a builder-host request untouched (single-domain no-op)", async () => {
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = redirectTo(`${BUILDER_URL}/`)
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(new URL(BUILDER_URL).host),
      response,
    )

    expect(rewritten).toBe(response)
    expect(mockIsAllowedOrigin).not.toHaveBeenCalled()
  })

  test("does not rewrite a redirect to a non-builder/broker origin", async () => {
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = redirectTo("https://accounts.google.com/o/oauth2/auth")
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(RESELLER_HOST),
      response,
    )

    expect(rewritten).toBe(response)
    expect(mockIsAllowedOrigin).not.toHaveBeenCalled()
  })

  test("does not rewrite when the public host is not a controlled origin", async () => {
    mockIsAllowedOrigin.mockResolvedValue(false)
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = redirectTo(`${BUILDER_URL}/`)
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest("evil.example.org"),
      response,
    )

    expect(rewritten.headers.get("location")).toBe(`${BUILDER_URL}/`)
    expect(mockIsAllowedOrigin).toHaveBeenCalled()
  })

  test("ignores non-redirect responses", async () => {
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = new Response("ok", { status: 200 })
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(RESELLER_HOST),
      response,
    )

    expect(rewritten).toBe(response)
    expect(mockIsAllowedOrigin).not.toHaveBeenCalled()
  })

  test("ignores a 3xx with no Location header", async () => {
    const { rewriteAuthRedirectToPublicHost } = await loadModule()

    const response = new Response(null, { status: 304 })
    const rewritten = await rewriteAuthRedirectToPublicHost(
      verifyRequest(RESELLER_HOST),
      response,
    )

    expect(rewritten).toBe(response)
  })
})
