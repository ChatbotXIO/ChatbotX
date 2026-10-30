import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteAccessByUserAndClient: vi.fn(),
  deleteConsentByUserAndClient: vi.fn(),
  deleteExpiredAccessTokens: vi.fn(),
  deleteExpiredRefreshTokens: vi.fn(),
  deleteRefreshByUserAndClient: vi.fn(),
  findByClientId: vi.fn(),
  findByIdOrFail: vi.fn(),
  findMembership: vi.fn(),
  listByUserId: vi.fn(),
  listGivenByUser: vi.fn(),
  logInfo: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  oauthAccessTokenRepository: {
    deleteByUserAndClient: mocks.deleteAccessByUserAndClient,
    deleteExpired: mocks.deleteExpiredAccessTokens,
  },
  oauthClientRepository: { findByClientId: mocks.findByClientId },
  oauthConsentRepository: {
    deleteByUserAndClient: mocks.deleteConsentByUserAndClient,
    listGivenByUser: mocks.listGivenByUser,
  },
  oauthRefreshTokenRepository: {
    deleteByUserAndClient: mocks.deleteRefreshByUserAndClient,
    deleteExpired: mocks.deleteExpiredRefreshTokens,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
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
vi.mock("../src/logger", () => ({
  logger: { info: mocks.logInfo },
}))

const { mcpOAuthService } = await import("../src/mcp-oauth/service")

const user = { id: "user-1", email: "owner@example.com" }
const principalInput = { clientId: "client-1", userId: "user-1" }

describe("mcpOAuthService.resolvePrincipal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects a missing OAuth client before resolving the user", async () => {
    mocks.findByClientId.mockResolvedValue(null)

    await expect(
      mcpOAuthService.resolvePrincipal(principalInput),
    ).resolves.toEqual({ kind: "invalidToken" })
    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
  })

  test("rejects a disabled OAuth client", async () => {
    mocks.findByClientId.mockResolvedValue({ disabled: true })

    await expect(
      mcpOAuthService.resolvePrincipal(principalInput),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("rejects a deleted OAuth user", async () => {
    mocks.findByClientId.mockResolvedValue({ disabled: false })
    mocks.findByIdOrFail.mockRejectedValue(
      new ChatbotXException("User not found", "notFound"),
    )

    await expect(
      mcpOAuthService.resolvePrincipal(principalInput),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("requires a workspace when the user belongs to multiple workspaces", async () => {
    mocks.findByClientId.mockResolvedValue({ disabled: false })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([
      { workspaceId: "ws-1", workspace: { id: "ws-1", name: "Alpha" } },
      { workspaceId: "ws-2", workspace: { id: "ws-2", name: "Beta" } },
    ])

    await expect(
      mcpOAuthService.resolvePrincipal(principalInput),
    ).resolves.toEqual({
      kind: "workspaceSelectionRequired",
      workspaces: [
        { id: "ws-1", name: "Alpha" },
        { id: "ws-2", name: "Beta" },
      ],
    })
  })

  test("returns a principal only for an active admin membership", async () => {
    const membership = {
      workspaceId: "ws-1",
      workspace: { id: "ws-1", name: "Alpha", ownerId: "user-1" },
      role: "owner",
      permissions: {},
    }
    mocks.findByClientId.mockResolvedValue({ disabled: false })
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.listByUserId.mockResolvedValue([membership])
    mocks.findMembership.mockResolvedValue(membership)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: membership.workspace,
      member: membership,
      isSupportSession: false,
    })

    await expect(
      mcpOAuthService.resolvePrincipal(principalInput),
    ).resolves.toEqual({
      kind: "principal",
      principal: {
        workspace: membership.workspace,
        user,
        clientId: "client-1",
      },
    })
  })
})

describe("mcpOAuthService.listGrantsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("preserves active grant data and de-duplicates array scopes", async () => {
    const firstAuthorizedAt = new Date("2026-10-01T00:00:00.000Z")
    mocks.listGivenByUser.mockResolvedValue([
      {
        activeUntil: null,
        clientIcon: "https://example.com/icon.svg",
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt,
        lastRefreshedAt: null,
        scopes: ["openid", "profile", "openid"],
      },
    ])

    await expect(
      mcpOAuthService.listGrantsForUser({ userId: "user-1" }),
    ).resolves.toEqual([
      {
        activeUntil: null,
        clientIcon: "https://example.com/icon.svg",
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt,
        lastRefreshedAt: null,
        scopes: ["openid", "profile"],
      },
    ])
  })
})

describe("mcpOAuthService.revokeGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) => await callback({}))
  })

  test("removes consent, refresh credentials, and stored access tokens", async () => {
    mocks.deleteAccessByUserAndClient.mockResolvedValue(1)
    mocks.deleteConsentByUserAndClient.mockResolvedValue(1)
    mocks.deleteRefreshByUserAndClient.mockResolvedValue(1)

    await expect(
      mcpOAuthService.revokeGrant({ clientId: "claude", userId: "user-1" }),
    ).resolves.toBe(true)
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { clientId: "claude", deleted: 3, userId: "user-1" },
      "Revoked MCP OAuth grant",
    )
  })
})

describe("mcpOAuthService.purgeExpiredTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("purges expired access and refresh token rows", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z")
    mocks.deleteExpiredAccessTokens.mockResolvedValue(2)
    mocks.deleteExpiredRefreshTokens.mockResolvedValue(3)

    await expect(mcpOAuthService.purgeExpiredTokens(now)).resolves.toBe(5)
    expect(mocks.deleteExpiredAccessTokens).toHaveBeenCalledWith(now)
    expect(mocks.deleteExpiredRefreshTokens).toHaveBeenCalledWith(now)
  })
})
