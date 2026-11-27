// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { assertApiNotRateLimited } = vi.hoisted(() => ({
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))

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

const formPost = (body: Record<string, string>, path = TOKEN_PATH) =>
  new Request(`https://app.example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("rateLimitMobilePasswordGrant", () => {
  test("throttles the password grant per account", async () => {
    const response = await rateLimitMobilePasswordGrant(
      post({
        grantType: "password",
        email: "  Agent@Example.com ",
        password: "x",
      }),
      TOKEN_PATH,
    )

    expect(response).toBeUndefined()
    expect(assertApiNotRateLimited).toHaveBeenCalledOnce()
    expect(assertApiNotRateLimited).toHaveBeenCalledWith({
      scope: "mobile-token-password-account-rate-limit",
      key: "agent@example.com",
      limit: 5,
    })
  })

  test("parses form grants and normalizes a trailing slash", async () => {
    const response = await rateLimitMobilePasswordGrant(
      formPost(
        {
          grantType: "password",
          email: "agent@example.com",
          password: "x",
        },
        `${TOKEN_PATH}/`,
      ),
      `${TOKEN_PATH}/`,
    )
    expect(response).toBeUndefined()

    expect(assertApiNotRateLimited).toHaveBeenCalledOnce()
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

  test("skips throttling when the body has no usable email", async () => {
    await rateLimitMobilePasswordGrant(
      post({ grantType: "password", password: "x" }),
      TOKEN_PATH,
    )

    expect(assertApiNotRateLimited).not.toHaveBeenCalled()
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
      "the id_token grant",
      post({ grantType: "id_token", provider: "apple", idToken: "t" }),
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
    ["a GET", new Request(`https://app.example.com${TOKEN_PATH}`), TOKEN_PATH],
  ])("does not throttle %s", async (_name, request, path) => {
    await expect(
      rateLimitMobilePasswordGrant(request, path),
    ).resolves.toBeUndefined()
    expect(assertApiNotRateLimited).not.toHaveBeenCalled()
  })

  test("returns 400 rather than skipping an unparsable password-grant body", async () => {
    const response = await rateLimitMobilePasswordGrant(
      new Request(`https://app.example.com${TOKEN_PATH}`, {
        method: "POST",
        body: "nope",
      }),
      TOKEN_PATH,
    )

    expect(response?.status).toBe(400)
    expect(await response?.json()).toMatchObject({ code: "BAD_REQUEST" })
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
