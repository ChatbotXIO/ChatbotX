// @vitest-environment node

import { ORPCError } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  find,
  isWorkspaceScheduledForDeletion,
  loggerWarn,
  checkWorkspaceOwnerAccess,
  checkApiRateLimit,
} = vi.hoisted(() => ({
  find: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  loggerWarn: vi.fn(),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
  checkApiRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find },
  isWorkspaceScheduledForDeletion,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarn, error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit,
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod: (method: string | undefined) =>
    !["GET", "HEAD", "DELETE"].includes(method ?? "POST"),
  workspaceAccessDenialOrpcError: (reason: string) =>
    new ORPCError(reason, { status: 403 }),
}))

const { workspaceTokenAuthMidddleware } = await import(
  "@/middlewares/workspace-token-auth"
)
const { hashToken } = await import("@/features/integration-api/lib/token-hash")

const next = vi.fn(async (opts?: { context: Record<string, unknown> }) => ({
  output: "ok",
  context: opts?.context,
}))

const callMiddleware = (
  headers: Headers,
  method: string | undefined,
  url?: string,
) =>
  (
    workspaceTokenAuthMidddleware as unknown as (opts: {
      context: { headers: Headers; url?: string }
      next: typeof next
      procedure: { "~orpc": { route: { method?: string } } }
    }) => Promise<unknown>
  )({
    context: { headers, url },
    next,
    procedure: { "~orpc": { route: { method } } },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  checkWorkspaceOwnerAccess.mockResolvedValue(null)
  checkApiRateLimit.mockResolvedValue({ limited: false })
})

describe("workspaceTokenAuthMidddleware", () => {
  test("hash hit skips the plaintext lookup and does not warn", async () => {
    const token = "ws1_abc"
    const tokenHash = await hashToken(token)
    find.mockImplementation(
      async ({ where }: { where: Record<string, string> }) =>
        where.tokenHash === tokenHash
          ? { id: "ws-1", ownerId: "owner-1", tokenHash }
          : undefined,
    )

    const headers = new Headers({ Authorization: `Bearer ${token}` })
    await callMiddleware(headers, "GET")

    expect(find).toHaveBeenCalledTimes(1)
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("hash miss falls back to plaintext lookup and warns", async () => {
    const token = "ws1_abc"
    find.mockImplementation(
      async ({ where }: { where: Record<string, string> }) =>
        where.token === token
          ? { id: "ws-1", ownerId: "owner-1", tokenHash: null }
          : undefined,
    )

    const headers = new Headers({ Authorization: `Bearer ${token}` })
    await callMiddleware(headers, "GET")

    expect(find).toHaveBeenCalledTimes(2)
    expect(loggerWarn).toHaveBeenCalledWith(
      { workspaceId: "ws-1" },
      "Workspace authenticated via legacy plaintext token",
    )
  })

  test("both hash and plaintext miss → INVALID_CHATBOT_TOKEN", async () => {
    find.mockResolvedValue(undefined)

    const headers = new Headers({ Authorization: "Bearer nope" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
    })
  })

  test("GET procedure with a blocked owner still passes", async () => {
    find.mockResolvedValue({ id: "ws-1", ownerId: "owner-1", tokenHash: "h" })
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalled()
  })

  test("POST procedure with a blocked owner is rejected with trialExpired 403", async () => {
    find.mockResolvedValue({ id: "ws-1", ownerId: "owner-1", tokenHash: "h" })
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "POST")).rejects.toMatchObject({
      code: "trialExpired",
      status: 403,
    })
  })

  test("rate-limited workspace token is rejected before the owner-access gate", async () => {
    find.mockResolvedValue({ id: "ws-1", ownerId: "owner-1", tokenHash: "h" })
    checkApiRateLimit.mockResolvedValue({ limited: true, retryAfter: 5 })

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "tooManyRequests",
    })
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("query-param token warns about the deprecated ?token= usage", async () => {
    const token = "ws1_abc"
    const tokenHash = await hashToken(token)
    find.mockImplementation(
      async ({ where }: { where: Record<string, string> }) =>
        where.tokenHash === tokenHash
          ? { id: "ws-1", ownerId: "owner-1", tokenHash }
          : undefined,
    )

    const headers = new Headers()
    await callMiddleware(
      headers,
      "GET",
      `https://example.com/api/v1/tags?token=${token}`,
    )

    expect(loggerWarn).toHaveBeenCalledWith(
      { path: "/api/v1/tags" },
      "Workspace token authenticated via deprecated ?token= query param",
    )
  })
})
