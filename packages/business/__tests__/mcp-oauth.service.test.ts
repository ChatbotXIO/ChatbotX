import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteExpired: vi.fn(),
  findByAccessToken: vi.fn(),
  findByClientId: vi.fn(),
  findByIdOrFail: vi.fn(),
  findMembership: vi.fn(),
  listByUserId: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  oauthAccessTokenRepository: {
    deleteExpired: mocks.deleteExpired,
    findByAccessToken: mocks.findByAccessToken,
  },
  oauthApplicationRepository: { findByClientId: mocks.findByClientId },
}))

vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findByIdOrFail },
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {
    findMembership: mocks.findMembership,
    listByUserId: mocks.listByUserId,
  },
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

const accessToken = (overrides: Record<string, unknown> = {}) => ({
  id: "at-1",
  userId: "user-1",
  clientId: "client-1",
  client: { disabled: false },
  accessTokenExpiresAt: FUTURE,
  ...overrides,
})

describe("mcpOAuthService.resolvePrincipal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns invalidToken when no access-token row matches", async () => {
    mocks.findByAccessToken.mockResolvedValue(null)

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "missing" }),
    ).resolves.toEqual({ kind: "invalidToken" })
    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
  })

  test("returns invalidToken when the access token has expired", async () => {
    mocks.findByAccessToken.mockResolvedValue(
      accessToken({ accessTokenExpiresAt: PAST }),
    )

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "expired" }),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("returns invalidToken when the row has no userId", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken({ userId: null }))

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "no-user" }),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("returns invalidToken when the OAuth client is disabled", async () => {
    mocks.findByAccessToken.mockResolvedValue(
      accessToken({ client: { disabled: true } }),
    )

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "disabled-client" }),
    ).resolves.toEqual({ kind: "invalidToken" })
    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
  })

  test("returns invalidToken when the token user no longer exists", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockRejectedValue(
      new ChatbotXException("User not found", "notFound"),
    )

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "deleted-user" }),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("returns forbidden when the account has no eligible workspace memberships", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([])

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "valid" }),
    ).resolves.toEqual({ kind: "forbidden" })
    expect(mocks.resolveWorkspaceAccess).not.toHaveBeenCalled()
  })

  test("excludes workspaces scheduled for deletion from the selection list", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      {
        workspaceId: "ws-deleting",
        workspace: {
          id: "ws-deleting",
          name: "Deleting",
          scheduledDeletionAt: new Date(),
        },
      },
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
      { workspaceId: "ws-2", workspace: { id: "ws-2", name: "Beta" } },
    ])

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "valid" }),
    ).resolves.toEqual({
      kind: "workspaceSelectionRequired",
      workspaces: [
        { id: "ws-1", name: "Alpha" },
        { id: "ws-2", name: "Beta" },
      ],
    })
  })

  test("uses the uncached membership as the access gate after auto-selecting the only workspace", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    const cachedMembership = {
      workspaceId: "ws-1",
      workspace: { id: "ws-1", name: "Alpha", ownerId: "user-1" },
    }
    const realMembership = {
      ...cachedMembership,
      role: "owner",
      permissions: {},
    }
    mocks.listByUserId.mockResolvedValue([cachedMembership])
    mocks.findMembership.mockResolvedValue(realMembership)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: realMembership.workspace,
      member: realMembership,
      isSupportSession: false,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "valid" }),
    ).resolves.toEqual({
      kind: "principal",
      principal: {
        workspace: realMembership.workspace,
        user,
        clientId: "client-1",
        accessTokenId: "at-1",
      },
    })
    expect(mocks.findMembership).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: user.id,
    })
    expect(mocks.resolveWorkspaceAccess).toHaveBeenCalledWith({
      realMember: realMembership,
      workspaceId: "ws-1",
      user,
    })
  })

  test("returns forbidden when resolveWorkspaceAccess finds no access", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
    ])
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue(undefined)

    await expect(
      mcpOAuthService.resolvePrincipal({
        accessToken: "valid",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ kind: "forbidden" })
  })

  test("returns forbidden for a support session", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
    ])
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "ws-1", name: "Alpha" },
      member: { role: "member", permissions: { superAdmin: true } },
      isSupportSession: true,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({
        accessToken: "valid",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ kind: "forbidden" })
  })

  test("returns forbidden when the resolved member is not an admin", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
    ])
    const member = { role: "member", permissions: { superAdmin: false } }
    mocks.findMembership.mockResolvedValue(member)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "ws-1", name: "Alpha" },
      member,
      isSupportSession: false,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({
        accessToken: "valid",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ kind: "forbidden" })
  })

  test("allows an owner-role member without a superAdmin permission flag", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    const membership = {
      workspaceId: "ws-2",
      workspace: { id: "ws-2", name: "Beta", ownerId: "user-1" },
      role: "owner",
      permissions: {},
    }
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
      membership,
    ])
    mocks.findMembership.mockResolvedValue(membership)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: membership.workspace,
      member: membership,
      isSupportSession: false,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({
        accessToken: "valid",
        workspaceId: "ws-2",
      }),
    ).resolves.toEqual({
      kind: "principal",
      principal: {
        workspace: membership.workspace,
        user,
        clientId: "client-1",
        accessTokenId: "at-1",
      },
    })
  })
})

describe("mcpOAuthService.purgeExpiredTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates token retention to the repository", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z")
    mocks.deleteExpired.mockResolvedValue(3)

    await expect(mcpOAuthService.purgeExpiredTokens(now)).resolves.toBe(3)
    expect(mocks.deleteExpired).toHaveBeenCalledWith(now)
  })
})

describe("mcpOAuthService.findClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to the OAuth application repository", async () => {
    const application = { id: "app-1", clientId: "client-1", name: "Inspector" }
    mocks.findByClientId.mockResolvedValue(application)

    await expect(
      mcpOAuthService.findClient({ clientId: "client-1" }),
    ).resolves.toBe(application)
    expect(mocks.findByClientId).toHaveBeenCalledWith("client-1")
  })
})
