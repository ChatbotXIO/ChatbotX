// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { assertApiNotRateLimited } = vi.hoisted(() => ({
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

const { rateLimitMobilePasswordGrant } = await import(
  "@/lib/mobile-auth/password-grant-rate-limit"
)

const TOKEN_PATH = "/api/auth/mobile/token"

const post = (body: unknown, path = TOKEN_PATH) =>
  new Request(`https://app.example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("rateLimitMobilePasswordGrant", () => {
  test("throttles the password grant per IP (3 per window, like sign-in) and per account", async () => {
    const response = await rateLimitMobilePasswordGrant(
      post({
        grantType: "password",
        email: "  Agent@Example.com ",
        password: "x",
      }),
      TOKEN_PATH,
    )

    expect(response).toBeUndefined()
    expect(assertApiNotRateLimited).toHaveBeenNthCalledWith(1, {
      scope: "mobile-token-password-ip-rate-limit",
      key: "203.0.113.9",
      limit: 3,
    })
    expect(assertApiNotRateLimited).toHaveBeenNthCalledWith(2, {
      scope: "mobile-token-password-account-rate-limit",
      key: "agent@example.com",
      limit: 5,
    })
  })

  test("answers 429 with Retry-After once either bucket is exhausted", async () => {
    assertApiNotRateLimited.mockRejectedValueOnce(
      new ChatbotXException(
        "Too many requests. Retry after 7s.",
        "tooManyRequests",
        429,
      ),
    )

    const response = await rateLimitMobilePasswordGrant(
      post({ grantType: "password", email: "a@b.co", password: "x" }),
      TOKEN_PATH,
    )

    expect(response?.status).toBe(429)
    expect(response?.headers.get("retry-after")).toBe("7")
    expect(await response?.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  test("the account bucket is skipped when the body has no usable email, the IP bucket still applies", async () => {
    await rateLimitMobilePasswordGrant(
      post({ grantType: "password", password: "x" }),
      TOKEN_PATH,
    )

    expect(assertApiNotRateLimited).toHaveBeenCalledTimes(1)
    expect(assertApiNotRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "mobile-token-password-ip-rate-limit" }),
    )
  })

  test.each([
    [
      "the refresh_token grant",
      post({ grantType: "refresh_token", refreshToken: "r" }),
      TOKEN_PATH,
    ],
    [
      "the exchange_code grant",
      post({ grantType: "exchange_code", code: "c" }),
      TOKEN_PATH,
    ],
    [
      "another auth path",
      post(
        { grantType: "password", email: "a@b.co" },
        "/api/auth/mobile/revoke",
      ),
      "/api/auth/mobile/revoke",
    ],
    [
      "a non-JSON body",
      new Request(`https://app.example.com${TOKEN_PATH}`, {
        method: "POST",
        body: "nope",
      }),
      TOKEN_PATH,
    ],
    ["a GET", new Request(`https://app.example.com${TOKEN_PATH}`), TOKEN_PATH],
  ])("does not throttle %s", async (_name, request, path) => {
    await expect(
      rateLimitMobilePasswordGrant(request, path),
    ).resolves.toBeUndefined()
    expect(assertApiNotRateLimited).not.toHaveBeenCalled()
  })

  test("other rate-limit failures propagate", async () => {
    assertApiNotRateLimited.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      rateLimitMobilePasswordGrant(
        post({ grantType: "password", email: "a@b.co", password: "x" }),
        TOKEN_PATH,
      ),
    ).rejects.toThrow("redis down")
  })
})
