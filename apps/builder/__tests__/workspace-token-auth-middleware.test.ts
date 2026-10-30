// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  loggerWarn,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  resolvePrincipal,
  verifyMcpAccessToken,
  withAuditContext,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  loggerWarn: vi.fn(),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  resolvePrincipal: vi.fn().mockResolvedValue({ kind: "invalidToken" }),
  verifyMcpAccessToken: vi.fn().mockResolvedValue({
    clientId: "client-oauth",
    userId: "user-oauth",
  }),
  withAuditContext: vi.fn(
    async (
      _context: Record<string, unknown>,
      callback: () => Promise<unknown>,
    ) => await callback(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  mcpOAuthService: { resolvePrincipal },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
}))

vi.mock("@chatbotx.io/auth/mcp-resource", () => ({ verifyMcpAccessToken }))

vi.mock("@/lib/auth/auth", () => ({ auth: {} }))

vi.mock("@chatbotx.io/business/audit", () => ({ withAuditContext }))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarn, error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

const { workspaceTokenAuthMidddleware } = await import(
  "@/middlewares/workspace-token-auth"
)
const { hashToken } = await import(
  "@chatbotx.io/business/workspace-api-token/credentials"
)

const next = vi.fn(async (opts?: { context: Record<string, unknown> }) => ({
  output: "ok",
  context: opts?.context,
}))

const callMiddleware = (
  headers: Headers,
  method: string | undefined,
  url?: string,
  path?: string,
) =>
  (
    workspaceTokenAuthMidddleware as unknown as (opts: {
      context: { headers: Headers; url?: string }
      next: typeof next
      procedure: { "~orpc": { route: { method?: string; path?: string } } }
    }) => Promise<unknown>
  )({
    context: { headers, url },
    next,
    procedure: { "~orpc": { route: { method, path } } },
  })

const authResult = (permission: "full" | "read_only" = "full") => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission },
})

const oauthPrincipal = {
  workspace: { id: "ws-oauth", ownerId: "owner-oauth" },
  user: { id: "user-oauth", email: "oauth@example.com" },
  clientId: "client-oauth",
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  resolvePrincipal.mockResolvedValue({ kind: "invalidToken" })
  withAuditContext.mockImplementation(
    async (_context, callback) => await callback(),
  )
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
      status: 401,
    })
  })

  test("hash miss → INVALID_CHATBOT_TOKEN (no plaintext fallback)", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)

    const headers = new Headers({ Authorization: "Bearer nope" })

    await expect(callMiddleware(headers, "GET")).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
      status: 401,
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
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalled()
  })

  test("POST procedure with a blocked owner is rejected with trialExpired 403", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "POST")).rejects.toMatchObject({
      code: "trialExpired",
      status: 403,
    })
  })

  test("allows the conversations list POST path for a trial-expired workspace", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(
      headers,
      "POST",
      undefined,
      "/workspaces/{workspaceId}/conversations/list",
    )

    expect(next).toHaveBeenCalled()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("DELETE procedure with a blocked owner still passes (invariant #14)", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult())
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "DELETE")

    expect(next).toHaveBeenCalled()
    expect(getAccessState).not.toHaveBeenCalled()
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
    expect(getAccessState).not.toHaveBeenCalled()
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
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("read_only token on a GET request passes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalled()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("read_only token on a DELETE request is rejected with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })

    await expect(callMiddleware(headers, "DELETE")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Read-only token cannot perform this operation",
    })
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("full-permission token on a mutation reaches the owner-quota gate", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("full"))

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "POST")

    expect(getAccessState).toHaveBeenCalledWith("owner-1")
    expect(next).toHaveBeenCalled()
  })

  test("forwards the authenticated token and its credential identity downstream", async () => {
    const auth = authResult("full")
    findWorkspaceByTokenHash.mockResolvedValue(auth)

    const headers = new Headers({ Authorization: "Bearer ws1_abc" })
    await callMiddleware(headers, "GET")

    expect(next).toHaveBeenCalledWith({
      context: {
        workspace: auth.workspace,
        apiToken: {
          id: "token-1",
          workspaceId: undefined,
          permission: "full",
          scopes: undefined,
          isDefault: undefined,
        },
        apiCredentialId: "api-token:token-1",
      },
    })
  })

  test("authenticates an OAuth principal with user attribution and forwards x-workspace-id", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)
    resolvePrincipal.mockResolvedValue({
      kind: "principal",
      principal: oauthPrincipal,
    })
    const headers = new Headers({
      Authorization: "Bearer oauth-token",
      "User-Agent": "MCP Inspector",
      "x-workspace-id": "ws-oauth",
    })

    await callMiddleware(headers, "GET")

    expect(verifyMcpAccessToken).toHaveBeenCalledWith({}, "oauth-token")
    expect(resolvePrincipal).toHaveBeenCalledWith({
      clientId: "client-oauth",
      userId: "user-oauth",
      workspaceId: "ws-oauth",
    })
    expect(next).toHaveBeenCalledWith({
      context: {
        workspace: oauthPrincipal.workspace,
        apiToken: {
          id: "oauth:client-oauth:user-oauth",
          workspaceId: "ws-oauth",
          permission: "full",
          scopes: null,
          isDefault: false,
        },
        apiCredentialId: "mcp-oauth:client-oauth",
      },
    })
    expect(withAuditContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-oauth",
        workspaceId: "ws-oauth",
        source: "mcp-oauth:client-oauth",
        userAgent: "MCP Inspector",
      }),
      expect.any(Function),
    )
  })

  test("maps a forbidden OAuth principal to 403", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)
    resolvePrincipal.mockResolvedValue({ kind: "forbidden" })

    await expect(
      callMiddleware(
        new Headers({ Authorization: "Bearer oauth-token" }),
        "GET",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
  })

  test("maps OAuth workspace selection to a documented 400", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)
    resolvePrincipal.mockResolvedValue({
      kind: "workspaceSelectionRequired",
      workspaces: [{ id: "ws-1", name: "Alpha" }],
    })

    await expect(
      callMiddleware(
        new Headers({ Authorization: "Bearer oauth-token" }),
        "GET",
      ),
    ).rejects.toMatchObject({
      code: "WORKSPACE_SELECTION_REQUIRED",
      status: 400,
      message: expect.stringContaining("ws-1 (Alpha)"),
    })
  })

  test("maps an invalid OAuth token to 401", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)
    resolvePrincipal.mockResolvedValue({ kind: "invalidToken" })

    await expect(
      callMiddleware(
        new Headers({ Authorization: "Bearer oauth-token" }),
        "GET",
      ),
    ).rejects.toMatchObject({ code: "INVALID_CHATBOT_TOKEN", status: 401 })
  })

  test("never sends a query-string workspace token to OAuth resolution", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)

    await expect(
      callMiddleware(
        new Headers(),
        "GET",
        "https://example.com/api/v1/tags?token=legacy-workspace-token",
      ),
    ).rejects.toMatchObject({ code: "INVALID_CHATBOT_TOKEN", status: 401 })
    expect(resolvePrincipal).not.toHaveBeenCalled()
  })
})
