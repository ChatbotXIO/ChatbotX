// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const MOBILE_TOKEN = "mobile.access.jwt"
const MCP_TOKEN = "mcp.access.jwt"

const mocks = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  resolvePrincipal: vi.fn().mockResolvedValue({ kind: "invalidToken" }),
  verifyMcpAccessToken: vi.fn().mockResolvedValue(null),
  verifyMobileAccessToken: vi.fn(),
  findUserById: vi.fn(),
  findMembership: vi.fn(),
  withAuditContext: vi.fn(
    async (
      _context: Record<string, unknown>,
      callback: () => Promise<unknown>,
    ) => await callback(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: {
    findWorkspaceByTokenHash: mocks.findWorkspaceByTokenHash,
  },
  mcpOAuthService: { resolvePrincipal: mocks.resolvePrincipal },
  isWorkspaceScheduledForDeletion: mocks.isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState: mocks.getAccessState },
  quotaEnforcementService: { isAtLimit: mocks.isAtLimit },
  userService: { findById: mocks.findUserById },
  workspaceMemberService: { findMembership: mocks.findMembership },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  withAuditContext: mocks.withAuditContext,
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: mocks.assertApiNotRateLimited,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/auth/auth", () => ({ auth: {} }))
vi.mock("@chatbotx.io/auth/mcp-resource", () => ({
  McpTokenVerificationUnavailableError: class extends Error {},
  verifyMcpAccessToken: mocks.verifyMcpAccessToken,
}))
vi.mock("@chatbotx.io/auth/mobile-resource", () => ({
  MobileTokenVerificationUnavailableError: class extends Error {},
  isMobileAccessTokenCandidate: (token: string) => token === MOBILE_TOKEN,
  verifyMobileAccessToken: mocks.verifyMobileAccessToken,
}))

const { workspaceTokenAuthMidddleware } = await import(
  "@/middlewares/workspace-token-auth"
)
const { deriveMemberScopes } = await import(
  "@/lib/mobile-auth/resolve-mobile-principal"
)
const { MOBILE_MEMBER_ROUTES } = await import(
  "@/lib/mobile-auth/member-route-allowlist"
)

const next = vi.fn(async (opts?: { context: Record<string, unknown> }) => ({
  output: "ok",
  context: opts?.context,
}))

const callMiddleware = (
  headers: Record<string, string>,
  route: { method: string; path: string } = {
    method: "GET",
    path: "/v1/conversations",
  },
) =>
  (
    workspaceTokenAuthMidddleware as unknown as (opts: {
      context: { headers: Headers; resHeaders: Headers }
      next: typeof next
      procedure: { "~orpc": { route: { method: string; path: string } } }
    }) => Promise<unknown>
  )({
    context: { headers: new Headers(headers), resHeaders: new Headers() },
    next,
    procedure: { "~orpc": { route } },
  })

const mobileHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${MOBILE_TOKEN}`,
  "x-workspace-id": "42",
  ...extra,
})

const AGENT_PERMISSIONS = { contacts: true, onlyAssignedContacts: true }

const membership = (
  permissions: Record<string, boolean> = AGENT_PERMISSIONS,
) => ({
  userId: "7",
  workspaceId: "42",
  role: "agent",
  permissions,
  workspace: { id: "42", ownerId: "owner-1" },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findWorkspaceByTokenHash.mockResolvedValue(undefined)
  mocks.isWorkspaceScheduledForDeletion.mockReturnValue(false)
  mocks.getAccessState.mockResolvedValue({ blocked: false })
  mocks.assertApiNotRateLimited.mockResolvedValue(undefined)
  mocks.verifyMcpAccessToken.mockResolvedValue(null)
  mocks.verifyMobileAccessToken.mockResolvedValue({
    userId: "7",
    deviceId: "install-1",
    mustChangePassword: false,
  })
  mocks.findUserById.mockResolvedValue({
    id: "7",
    email: "agent@example.com",
    mustChangePassword: false,
  })
  mocks.findMembership.mockResolvedValue(membership())
  mocks.withAuditContext.mockImplementation(
    async (_context, callback) => await callback(),
  )
})

describe("workspaceTokenAuthMidddleware — mobile JWT branch", () => {
  test("a valid mobile token authenticates as the member of the requested workspace", async () => {
    await callMiddleware(mobileHeaders())

    expect(mocks.findMembership).toHaveBeenCalledWith({
      workspaceId: "42",
      userId: "7",
    })
    const { context } = next.mock.calls[0][0] as {
      context: Record<string, unknown>
    }
    expect(context).toMatchObject({
      workspace: { id: "42" },
      member: { userId: "7", permissions: AGENT_PERMISSIONS },
      mobileDeviceId: "install-1",
      apiCredentialId: "mobile:7:install-1",
      apiToken: {
        permission: "full",
        scopes: ["contacts", "inbox", "automation", "broadcasts", "media"],
        isDefault: false,
      },
    })
    expect(typeof context.requestIssuedAtMs).toBe("number")
  })

  test("is audited as mobile:<deviceId> with the real user, not the workspace owner", async () => {
    await callMiddleware(mobileHeaders())

    expect(mocks.withAuditContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "7",
        workspaceId: "42",
        source: "mobile:install-1",
      }),
      expect.any(Function),
    )
  })

  test("is rate limited per user, never through the workspace bucket", async () => {
    await callMiddleware(mobileHeaders())

    const scopes = mocks.assertApiNotRateLimited.mock.calls.map(
      ([call]) => call.scope,
    )
    expect(scopes).toEqual([
      "workspace-token-preauth-rate-limit",
      "mobile-user-rate-limit",
    ])
    expect(mocks.assertApiNotRateLimited).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "7" }),
    )
  })

  test("never reaches the MCP verifier or resolver", async () => {
    await callMiddleware(mobileHeaders())

    expect(mocks.verifyMcpAccessToken).not.toHaveBeenCalled()
    expect(mocks.resolvePrincipal).not.toHaveBeenCalled()
  })

  test("a token that fails mobile verification is a 401 and does not fall through to MCP", async () => {
    mocks.verifyMobileAccessToken.mockResolvedValue(null)

    await expect(callMiddleware(mobileHeaders())).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
      status: 401,
    })
    expect(mocks.verifyMcpAccessToken).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  test("a token for a user that no longer exists is a 401", async () => {
    mocks.findUserById.mockResolvedValue(undefined)

    await expect(callMiddleware(mobileHeaders())).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
    })
  })

  test("mustChangePassword is read from the database and blocks every workspace route", async () => {
    mocks.findUserById.mockResolvedValue({
      id: "7",
      email: "agent@example.com",
      mustChangePassword: true,
    })

    await expect(callMiddleware(mobileHeaders())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Password change required",
    })
    expect(mocks.findMembership).not.toHaveBeenCalled()
  })

  test("a route that is not on the mobile allowlist is refused before any workspace lookup", async () => {
    await expect(
      callMiddleware(mobileHeaders(), {
        method: "GET",
        path: "/v1/analytics/overview",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This operation is not available to mobile sessions",
    })
    expect(mocks.findMembership).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  test("the same path with a different method is not allowlisted either", async () => {
    await expect(
      callMiddleware(mobileHeaders(), {
        method: "DELETE",
        path: "/v1/conversations",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test.each([
    ["is missing", undefined],
    ["is not numeric", "42; DROP TABLE"],
  ])("an x-workspace-id header that %s is 400 WORKSPACE_SELECTION_REQUIRED", async (_name, value) => {
    const headers = mobileHeaders()
    if (value === undefined) {
      Reflect.deleteProperty(headers, "x-workspace-id")
    } else {
      headers["x-workspace-id"] = value
    }

    await expect(callMiddleware(headers)).rejects.toMatchObject({
      code: "WORKSPACE_SELECTION_REQUIRED",
      status: 400,
    })
    expect(mocks.findMembership).not.toHaveBeenCalled()
  })

  test("a user who is not a member of the workspace is 403", async () => {
    mocks.findMembership.mockResolvedValue(undefined)

    await expect(callMiddleware(mobileHeaders())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Account has no access to this workspace",
    })
  })

  test("a scheduled-for-deletion workspace is refused like for any other credential", async () => {
    mocks.isWorkspaceScheduledForDeletion.mockReturnValue(true)

    await expect(callMiddleware(mobileHeaders())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace deletion scheduled",
    })
  })

  test("a trial-expired owner blocks a mobile mutation but not a read", async () => {
    mocks.getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await callMiddleware(mobileHeaders())
    expect(next).toHaveBeenCalledTimes(1)

    await expect(
      callMiddleware(mobileHeaders(), {
        method: "POST",
        path: "/v1/conversations/{id}/archive",
      }),
    ).rejects.toMatchObject({ code: "trialExpired", status: 403 })
  })
})

describe("workspaceTokenAuthMidddleware — other credentials are unchanged", () => {
  test("an MCP OAuth token still goes through the MCP verifier and resolver", async () => {
    mocks.verifyMcpAccessToken.mockResolvedValue({
      clientId: "client-1",
      userId: "7",
    })
    mocks.resolvePrincipal.mockResolvedValue({
      kind: "principal",
      principal: {
        workspace: { id: "ws-oauth", ownerId: "owner-oauth" },
        user: { id: "7", email: "oauth@example.com" },
        clientId: "client-1",
      },
    })

    await callMiddleware({ Authorization: `Bearer ${MCP_TOKEN}` })

    expect(mocks.verifyMcpAccessToken).toHaveBeenCalledWith({}, MCP_TOKEN)
    expect(mocks.verifyMobileAccessToken).not.toHaveBeenCalled()
    const { context } = next.mock.calls[0][0] as {
      context: Record<string, unknown>
    }
    // MCP stays workspace-level: no member, so no member scoping anywhere.
    expect(context).not.toHaveProperty("member")
    expect(context).toMatchObject({
      apiToken: { permission: "full", scopes: null },
      apiCredentialId: "mcp-oauth:client-1",
    })
  })

  test("a workspace API token is still workspace-level and uses the workspace bucket", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: { id: "token-1", permission: "full", scopes: null },
    })

    await callMiddleware({ Authorization: "Bearer cbx_ws_plain_token" })

    const { context } = next.mock.calls[0][0] as {
      context: Record<string, unknown>
    }
    expect(context).not.toHaveProperty("member")
    expect(mocks.assertApiNotRateLimited).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: "workspace-token-rate-limit" }),
    )
    expect(mocks.findMembership).not.toHaveBeenCalled()
  })

  test("a workspace API token is not subject to the mobile route allowlist", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: { id: "token-1", permission: "full", scopes: null },
    })

    await callMiddleware(
      { Authorization: "Bearer cbx_ws_plain_token" },
      { method: "GET", path: "/v1/analytics/overview" },
    )

    expect(next).toHaveBeenCalled()
  })
})

describe("member scopes and the route allowlist", () => {
  test("a member with contacts access gets the inbox resource areas", () => {
    expect(
      deriveMemberScopes({ permissions: { contacts: true } } as never),
    ).toEqual(["contacts", "inbox", "automation", "broadcasts", "media"])
    expect(
      deriveMemberScopes({
        permissions: { onlyAssignedContacts: true },
      } as never),
    ).toHaveLength(5)
    expect(
      deriveMemberScopes({ permissions: { superAdmin: true } } as never),
    ).toHaveLength(5)
  })

  test("a member with no contacts/inbox access gets no resource area at all", () => {
    expect(
      deriveMemberScopes({ permissions: { analytics: true } } as never),
    ).toEqual([])
    expect(deriveMemberScopes({ permissions: {} } as never)).toEqual([])
  })

  test("the allowlist holds only read/write operations the mobile app needs: no export, import, bulk, broadcast or admin routes", () => {
    const forbiddenFragments = [
      "/export",
      "/import",
      "/bulk",
      "/broadcasts",
      "/analytics",
      "/channels",
      "/connections",
      "/tokens",
      "/webhooks",
    ]
    for (const route of MOBILE_MEMBER_ROUTES) {
      for (const fragment of forbiddenFragments) {
        expect(route).not.toContain(fragment)
      }
    }
  })
})
