import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { mcpOAuthService } from "../src/mcp-oauth/service"

const mocks = vi.hoisted(() => ({
  deleteAccessTokens: vi.fn(),
  deleteConsents: vi.fn(),
  deleteExpiredAccessTokens: vi.fn(),
  deleteExpiredRefreshTokens: vi.fn(),
  deleteRefreshTokens: vi.fn(),
  findClientById: vi.fn(),
  findMembership: vi.fn(),
  findUserById: vi.fn(),
  findLatestConsent: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  listGivenConsents: vi.fn(),
  listMemberships: vi.fn(),
  logInfo: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  setConsentWorkspace: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  oauthAccessTokenRepository: {
    deleteByUserAndClient: mocks.deleteAccessTokens,
    deleteExpired: mocks.deleteExpiredAccessTokens,
  },
  oauthClientRepository: { findByClientId: mocks.findClientById },
  oauthConsentRepository: {
    deleteByUserAndClient: mocks.deleteConsents,
    findLatestGivenByUserAndClient: mocks.findLatestConsent,
    listGivenByUser: mocks.listGivenConsents,
    setWorkspaceByUserAndClient: mocks.setConsentWorkspace,
  },
  oauthRefreshTokenRepository: {
    deleteByUserAndClient: mocks.deleteRefreshTokens,
    deleteExpired: mocks.deleteExpiredRefreshTokens,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock("../src/logger", () => ({ logger: { info: mocks.logInfo } }))
vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findUserById },
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {
    findMembership: mocks.findMembership,
    listByUserId: mocks.listMemberships,
  },
}))
vi.mock("../src/workspace-support-access/resolve-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess,
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

const user = { id: "user-1", email: "owner@example.com" }
const workspace = { id: "workspace-1", name: "Workspace", ownerId: user.id }
const activeClient = { clientId: "client-1", disabled: false }

const makeAdminAccess = () => {
  const member = {
    permissions: {},
    role: "owner",
    workspace,
    workspaceId: workspace.id,
  }
  mocks.findMembership.mockResolvedValue(member)
  mocks.resolveWorkspaceAccess.mockResolvedValue({
    isSupportSession: false,
    member,
    workspace,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findClientById.mockResolvedValue(activeClient)
  mocks.findLatestConsent.mockResolvedValue({ workspaceId: workspace.id })
  mocks.findUserById.mockResolvedValue(user)
  mocks.listMemberships.mockResolvedValue([])
  mocks.transaction.mockImplementation(async (callback) => await callback({}))
  makeAdminAccess()
})

describe("mcpOAuthService.resolvePrincipal", () => {
  test("accepts a valid Better Auth OAuth principal", async () => {
    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
      }),
    ).resolves.toEqual({
      kind: "principal",
      principal: { clientId: "client-1", user, workspace },
    })

    expect(mocks.findClientById).toHaveBeenCalledWith("client-1")
    expect(mocks.findLatestConsent).toHaveBeenCalledWith({
      clientId: "client-1",
      userId: user.id,
    })
  })

  test("rejects a disabled or missing OAuth client", async () => {
    mocks.findClientById.mockResolvedValueOnce({
      ...activeClient,
      disabled: true,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
      }),
    ).resolves.toEqual({ kind: "invalidToken" })
    expect(mocks.findUserById).not.toHaveBeenCalled()
  })

  test("rejects a deleted token subject", async () => {
    mocks.findUserById.mockRejectedValueOnce(
      new ChatbotXException("Not found", "notFound", 404),
    )

    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
      }),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("rejects a principal with no consent", async () => {
    mocks.findLatestConsent.mockResolvedValueOnce(null)

    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
      }),
    ).resolves.toEqual({ kind: "invalidToken" })
  })

  test("rejects a requested workspace different from the consented workspace", async () => {
    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
        workspaceId: "other-workspace",
      }),
    ).resolves.toEqual({ kind: "forbidden" })
    expect(mocks.findMembership).not.toHaveBeenCalled()
  })

  test("requires a workspace selection for legacy unbound consent", async () => {
    mocks.findLatestConsent.mockResolvedValueOnce({ workspaceId: null })
    mocks.listMemberships.mockResolvedValueOnce([
      {
        permissions: {},
        role: "owner",
        workspace: { id: "workspace-1", name: "Workspace" },
      },
      {
        permissions: { superAdmin: true },
        role: "agent",
        workspace: { id: "workspace-2", name: "Second workspace" },
      },
    ])

    await expect(
      mcpOAuthService.resolvePrincipal({
        clientId: "client-1",
        userId: user.id,
      }),
    ).resolves.toEqual({
      kind: "workspaceSelectionRequired",
      workspaces: [
        { id: "workspace-1", name: "Workspace" },
        { id: "workspace-2", name: "Second workspace" },
      ],
    })
  })
})

describe("mcpOAuthService.bindConsentWorkspace", () => {
  test("updates the consent only after confirming current admin access", async () => {
    mocks.setConsentWorkspace.mockResolvedValueOnce(1)

    await expect(
      mcpOAuthService.bindConsentWorkspace({
        clientId: "client-1",
        user,
        workspaceId: workspace.id,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.setConsentWorkspace).toHaveBeenCalledWith({
      clientId: "client-1",
      userId: user.id,
      workspaceId: workspace.id,
    })
  })

  test("fails when Better Auth did not create a consent", async () => {
    mocks.setConsentWorkspace.mockResolvedValueOnce(0)

    await expect(
      mcpOAuthService.bindConsentWorkspace({
        clientId: "client-1",
        user,
        workspaceId: workspace.id,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("mcpOAuthService grants", () => {
  test("retains all Better Auth scopes and falls back to the client id", async () => {
    const authorizedAt = new Date("2026-10-01T00:00:00.000Z")
    mocks.listGivenConsents.mockResolvedValueOnce([
      {
        activeUntil: null,
        clientIcon: null,
        clientId: "client-1",
        clientName: null,
        firstAuthorizedAt: authorizedAt,
        lastRefreshedAt: null,
        scopes: ["openid", "profile", "openid"],
      },
    ])

    await expect(
      mcpOAuthService.listGrantsForUser({ userId: user.id }),
    ).resolves.toEqual([
      {
        activeUntil: null,
        clientIcon: null,
        clientId: "client-1",
        clientName: "client-1",
        firstAuthorizedAt: authorizedAt,
        lastRefreshedAt: null,
        scopes: ["openid", "profile"],
      },
    ])
  })

  test("revokes access tokens, refresh tokens, and consents together", async () => {
    mocks.deleteAccessTokens.mockResolvedValueOnce(1)
    mocks.deleteConsents.mockResolvedValueOnce(1)
    mocks.deleteRefreshTokens.mockResolvedValueOnce(1)

    await expect(
      mcpOAuthService.revokeGrant({ clientId: "client-1", userId: user.id }),
    ).resolves.toBe(true)
    expect(mocks.deleteAccessTokens).toHaveBeenCalledWith(
      { clientId: "client-1", userId: user.id },
      {},
    )
    expect(mocks.deleteRefreshTokens).toHaveBeenCalledWith(
      { clientId: "client-1", userId: user.id },
      {},
    )
  })

  test("purges expired access and refresh tokens", async () => {
    const now = new Date("2026-10-01T00:00:00.000Z")
    mocks.deleteExpiredAccessTokens.mockResolvedValueOnce(2)
    mocks.deleteExpiredRefreshTokens.mockResolvedValueOnce(3)

    await expect(mcpOAuthService.purgeExpiredTokens(now)).resolves.toBe(5)
  })
})
