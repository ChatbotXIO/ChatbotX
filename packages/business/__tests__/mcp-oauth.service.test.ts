import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByAccessToken: vi.fn(),
  findByClientId: vi.fn(),
  findByIdOrFail: vi.fn(),
  listByUserId: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  oauthAccessTokenRepository: { findByAccessToken: mocks.findByAccessToken },
  oauthApplicationRepository: { findByClientId: mocks.findByClientId },
}))

vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findByIdOrFail },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { listByUserId: mocks.listByUserId },
}))

vi.mock("../src/workspace-support-access/resolve-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

const { mcpOAuthService } = await import("../src/mcp-oauth/service")

const FUTURE = new Date(Date.now() + 60 * 60 * 1000)
const PAST = new Date(Date.now() - 60 * 1000)

const user = { id: "user-1", email: "owner@example.com" }

describe("mcpOAuthService.resolvePrincipal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns invalidToken when no access-token row matches", async () => {
    mocks.findByAccessToken.mockResolvedValue(null)

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "missing",
    })

    expect(result).toEqual({ kind: "invalidToken" })
    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
  })

  test("returns invalidToken when the access token has expired", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: PAST,
    })

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "expired",
    })

    expect(result).toEqual({ kind: "invalidToken" })
  })

  test("returns invalidToken when the row has no userId", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: null,
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "no-user",
    })

    expect(result).toEqual({ kind: "invalidToken" })
  })

  test("returns forbidden when the account has no workspace memberships", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([])

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
    })

    expect(result).toEqual({ kind: "forbidden" })
    expect(mocks.resolveWorkspaceAccess).not.toHaveBeenCalled()
  })

  test("returns workspaceSelectionRequired when multiple memberships and no workspaceId given", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
      { workspaceId: "ws-2", workspace: { id: "ws-2", name: "Beta" } },
    ])

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
    })

    expect(result).toEqual({
      kind: "workspaceSelectionRequired",
      workspaces: [
        { id: "ws-1", name: "Alpha" },
        { id: "ws-2", name: "Beta" },
      ],
    })
  })

  test("resolves the single membership's workspace when no workspaceId is given", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    const membership = {
      workspaceId: "ws-1",
      workspace: { id: "ws-1", name: "Alpha", ownerId: "user-1" },
      permissions: { superAdmin: true },
    }
    mocks.listByUserId.mockResolvedValue([membership])
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: membership.workspace,
      member: membership,
      isSupportSession: false,
    })

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
    })

    expect(result).toEqual({
      kind: "principal",
      principal: {
        workspace: membership.workspace,
        user,
        clientId: "client-1",
        accessTokenId: "at-1",
      },
    })
    expect(mocks.resolveWorkspaceAccess).toHaveBeenCalledWith({
      realMember: membership,
      workspaceId: "ws-1",
      user,
    })
  })

  test("returns forbidden when resolveWorkspaceAccess finds no access", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
    ])
    mocks.resolveWorkspaceAccess.mockResolvedValue(undefined)

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ kind: "forbidden" })
  })

  test("returns forbidden when the resolved member is not superAdmin", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
    ])
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "ws-1", name: "Alpha" },
      member: { permissions: { superAdmin: false } },
      isSupportSession: false,
    })

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ kind: "forbidden" })
  })

  test("resolves the explicitly requested workspace over the account's other memberships", async () => {
    mocks.findByAccessToken.mockResolvedValue({
      id: "at-1",
      userId: "user-1",
      clientId: "client-1",
      accessTokenExpiresAt: FUTURE,
    })
    mocks.findByIdOrFail.mockResolvedValue(user)
    const targetMembership = {
      workspaceId: "ws-2",
      workspace: { id: "ws-2", name: "Beta", ownerId: "user-1" },
      permissions: { superAdmin: true },
    }
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
      targetMembership,
    ])
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: targetMembership.workspace,
      member: targetMembership,
      isSupportSession: false,
    })

    const result = await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
      workspaceId: "ws-2",
    })

    expect(result).toEqual({
      kind: "principal",
      principal: {
        workspace: targetMembership.workspace,
        user,
        clientId: "client-1",
        accessTokenId: "at-1",
      },
    })
    expect(mocks.resolveWorkspaceAccess).toHaveBeenCalledWith({
      realMember: targetMembership,
      workspaceId: "ws-2",
      user,
    })
  })
})

describe("mcpOAuthService.findClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to the OAuth application repository", async () => {
    const application = { id: "app-1", clientId: "client-1", name: "Inspector" }
    mocks.findByClientId.mockResolvedValue(application)

    const result = await mcpOAuthService.findClient({ clientId: "client-1" })

    expect(result).toBe(application)
    expect(mocks.findByClientId).toHaveBeenCalledWith("client-1")
  })
})
