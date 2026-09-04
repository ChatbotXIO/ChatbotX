// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ORPCError } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  loggerWarn,
  checkWorkspaceOwnerAccess,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  loggerWarn: vi.fn(),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarn, error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod: (method: string | undefined) =>
    !["GET", "HEAD", "DELETE"].includes(method ?? "POST"),
  isReadOnlyTokenAllowedMethod: (method: string | undefined) =>
    ["GET", "HEAD"].includes(method ?? "POST"),
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

const authResult = (permission: "full" | "read_only" = "full") => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission },
})

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  checkWorkspaceOwnerAccess.mockResolvedValue(null)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("workspaceTokenAuthMidddleware", () => {
  test("hash hit authenticates the workspace and does not warn", async () => {
    const token = "ws1_abc"
    const tokenHash = await hashToken(token)
    findWorkspaceByTokenHash.mockImplementation(
      async ({ tokenHash: candidate }: { tokenHash: string }) =>
        candidate === tokenHash ? authResult() : undefined,
    )

    const headers = new Headers({ Authorization: `Bearer ${token}` })
    await callMiddleware(headers, "GET")

    expect(findWorkspaceByTokenHash).toHaveBeenCalledTimes(1)
    expect(loggerWarn).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
    // Coarse pre-auth IP bucket first, then the per-workspace bucket.
    expect(assertApiNotRateLimited).toHaveBeenNthCalledWith(1, {
      scope: "workspace-token-preauth-rate-limit",
      key: "203.0.113.9",
      limit: 600,
    })
    expect(assertApiNotRateLimited).toHaveBeenNthCalledWith(2, {
      scope: "workspace-token-rate-limit",
      key: "ws-1",
    })
  })

  test("stale cached token pointing at a purged workspace → INVALID_CHATBOT_TOKEN, not a raw notFound", async () => {
    findWorkspaceByTokenHash.mockRejectedValue(
      new ChatbotXException("Workspace not found", "notFound"),
    )

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
    })
  })

  test("hash miss → INVALID_CHATBOT_TOKEN (no plaintext fallback)", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)

    const headers = new Headers({ Authorization: "Bearer nope" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
    })
    expect(findWorkspaceByTokenHash).toHaveBeenCalledTimes(1)
    // Invalid guesses never resolve a workspace, so only the pre-auth
    // IP bucket throttles them — it must have been consulted.
    expect(assertApiNotRateLimited).toHaveBeenCalledTimes(1)
    expect(assertApiNotRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "workspace-token-preauth-rate-limit",
      }),
    )
  })

  test("GET procedure with a blocked owner still passes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalled()
  })

  test("POST procedure with a blocked owner is rejected with trialExpired 403", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "POST")).rejects.toMatchObject({
      code: "trialExpired",
      status: 403,
    })
  })

  test("DELETE procedure with a blocked owner still passes (invariant #14)", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "DELETE")

    expect(next).toHaveBeenCalled()
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("scheduled-deletion workspace is rejected with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    isWorkspaceScheduledForDeletion.mockReturnValue(true)

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace deletion scheduled",
    })
  })

  test("rate-limited workspace token is rejected before the owner-access gate", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    assertApiNotRateLimited.mockRejectedValue(
      Object.assign(new Error("Too many requests. Retry after 5s."), {
        code: "tooManyRequests",
      }),
    )

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "tooManyRequests",
    })
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("query-param token warns about the deprecated ?token= usage", async () => {
    const token = "ws1_abc"
    const tokenHash = await hashToken(token)
    findWorkspaceByTokenHash.mockImplementation(
      async ({ tokenHash: candidate }: { tokenHash: string }) =>
        candidate === tokenHash ? authResult() : undefined,
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

  test("read_only token on a mutation is rejected with FORBIDDEN before the owner-quota gate", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "POST")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Read-only token cannot perform this operation",
    })
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("read_only token on a GET request passes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalled()
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("read_only token on a DELETE request is rejected with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "DELETE")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Read-only token cannot perform this operation",
    })
    expect(checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
  })

  test("full-permission token on a mutation reaches the owner-quota gate", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "POST")

    expect(checkWorkspaceOwnerAccess).toHaveBeenCalledWith({
      ownerId: "owner-1",
    })
    expect(next).toHaveBeenCalled()
  })

  test("forwards apiToken into context alongside workspace, for scope enforcement downstream", async () => {
    const auth = authResult("full")
    findWorkspaceByTokenHash.mockResolvedValue(auth)

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalledWith({
      context: { workspace: auth.workspace, apiToken: auth.apiToken },
    })
  })
})
