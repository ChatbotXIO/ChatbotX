// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const MOBILE_TOKEN = "mobile.access.jwt"

const mocks = vi.hoisted(() => ({
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  verifyMobileAccessToken: vi.fn(),
  findUserById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  userService: { findById: mocks.findUserById },
  workspaceMemberService: { findMembership: vi.fn() },
}))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: mocks.assertApiNotRateLimited,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/lib/auth/auth", () => ({ auth: {} }))
vi.mock("@chatbotx.io/auth/mobile-resource", () => ({
  MobileTokenVerificationUnavailableError: class extends Error {},
  isMobileAccessTokenCandidate: (token: string) => token === MOBILE_TOKEN,
  verifyMobileAccessToken: mocks.verifyMobileAccessToken,
}))

const { mobileUserAuthMiddleware, mobileUserPasswordChangeAuthMiddleware } =
  await import("@/middlewares/mobile-user-auth")

const next = vi.fn(async (opts?: { context: Record<string, unknown> }) => ({
  output: "ok",
  context: opts?.context,
}))

const run = (middleware: unknown, headers: Record<string, string>) =>
  (
    middleware as (opts: {
      context: { headers: Headers; resHeaders: Headers }
      next: typeof next
    }) => Promise<unknown>
  )({
    context: { headers: new Headers(headers), resHeaders: new Headers() },
    next,
  })

const bearer = (token = MOBILE_TOKEN) => ({ Authorization: `Bearer ${token}` })

const dbUser = {
  id: "7",
  name: "Agent",
  email: "agent@example.com",
  tenantId: "1",
  mustChangePassword: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertApiNotRateLimited.mockResolvedValue(undefined)
  mocks.verifyMobileAccessToken.mockResolvedValue({
    userId: "7",
    deviceId: "install-1",
    mustChangePassword: false,
  })
  mocks.findUserById.mockResolvedValue(dbUser)
})

describe("mobile user auth middleware (/v1/me)", () => {
  test("authenticates the token's user and never exposes the tenant id", async () => {
    await run(mobileUserAuthMiddleware, bearer())

    const { context } = next.mock.calls[0][0] as {
      context: Record<string, any>
    }
    expect(context.user).toMatchObject({ id: "7", email: "agent@example.com" })
    expect(context.user).not.toHaveProperty("tenantId")
    expect(context).toMatchObject({
      mobileDeviceId: "install-1",
      apiCredentialId: "mobile:7:install-1",
    })
  })

  test.each([
    ["no Authorization header", {}],
    ["a token that is not a JWT", bearer("opaque-api-key")],
    [
      "a JWT with another audience (workspace API token / MCP)",
      bearer("mcp.access.jwt"),
    ],
  ])("%s is 401 INVALID_CHATBOT_TOKEN", async (_name, headers) => {
    await expect(run(mobileUserAuthMiddleware, headers)).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
      status: 401,
    })
    expect(next).not.toHaveBeenCalled()
  })

  test("a token that fails verification or names a deleted user is 401", async () => {
    mocks.verifyMobileAccessToken.mockResolvedValueOnce(null)
    await expect(run(mobileUserAuthMiddleware, bearer())).rejects.toMatchObject(
      {
        code: "INVALID_CHATBOT_TOKEN",
      },
    )

    mocks.findUserById.mockResolvedValueOnce(undefined)
    await expect(run(mobileUserAuthMiddleware, bearer())).rejects.toMatchObject(
      {
        code: "INVALID_CHATBOT_TOKEN",
      },
    )
  })

  test("is throttled per client IP first, then per user", async () => {
    await run(mobileUserAuthMiddleware, bearer())

    expect(
      mocks.assertApiNotRateLimited.mock.calls.map(([call]) => [
        call.scope,
        call.key,
      ]),
    ).toEqual([
      ["workspace-token-preauth-rate-limit", "203.0.113.9"],
      ["mobile-user-rate-limit", "7"],
    ])
  })

  test("a user with a provisioned temporary password is refused", async () => {
    mocks.findUserById.mockResolvedValue({
      ...dbUser,
      mustChangePassword: true,
    })

    await expect(run(mobileUserAuthMiddleware, bearer())).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
        message: "Password change required",
      },
    )
  })

  test("only the password-change variant lets that user through", async () => {
    mocks.findUserById.mockResolvedValue({
      ...dbUser,
      mustChangePassword: true,
    })

    await run(mobileUserPasswordChangeAuthMiddleware, bearer())

    expect(next).toHaveBeenCalledTimes(1)
  })
})
