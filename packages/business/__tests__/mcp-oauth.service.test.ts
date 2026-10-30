import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteByUserAndClient: vi.fn(),
  deleteConsentByUserAndClient: vi.fn(),
  deleteExpired: vi.fn(),
  findByAccessToken: vi.fn(),
  findByClientId: vi.fn(),
  findByIdentifier: vi.fn(),
  findLatestConsent: vi.fn(),
  setConsentWorkspace: vi.fn(),
  findByIdOrFail: vi.fn(),
  findMembership: vi.fn(),
  listGivenByUser: vi.fn(),
  listByUserId: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  transaction: vi.fn(),
  logInfo: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  oauthAccessTokenRepository: {
    deleteByUserAndClient: mocks.deleteByUserAndClient,
    deleteExpired: mocks.deleteExpired,
    findByAccessToken: mocks.findByAccessToken,
    listGivenByUser: mocks.listGivenByUser,
  },
  oauthApplicationRepository: { findByClientId: mocks.findByClientId },
  oauthConsentRepository: {
    deleteByUserAndClient: mocks.deleteConsentByUserAndClient,
    findLatestGivenByUserAndClient: mocks.findLatestConsent,
    listGivenByUser: mocks.listGivenByUser,
    setWorkspaceByUserAndClient: mocks.setConsentWorkspace,
  },
  verificationRepository: { findByIdentifier: mocks.findByIdentifier },
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
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.logInfo },
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

const ownerAccess = (workspaceId: string) => {
  const member = {
    workspaceId,
    workspace: { id: workspaceId, name: workspaceId, ownerId: "user-1" },
    role: "owner",
    permissions: {},
  }
  mocks.findMembership.mockResolvedValue(member)
  mocks.resolveWorkspaceAccess.mockResolvedValue({
    workspace: member.workspace,
    member,
    isSupportSession: false,
  })
  return member
}

describe("mcpOAuthService.resolveConsentRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByIdentifier.mockResolvedValue({
      expiresAt: FUTURE,
      value: JSON.stringify({
        clientId: "client-1",
        requireConsent: true,
        userId: "user-1",
      }),
    })
  })

  test("returns the client bound to a live consent code for its user", async () => {
    await expect(
      mcpOAuthService.resolveConsentRequest({
        consentCode: "consent-code",
        userId: "user-1",
      }),
    ).resolves.toEqual({ clientId: "client-1" })

    expect(mocks.findByIdentifier).toHaveBeenCalledWith("consent-code")
  })

  test("rejects a consent code belonging to another user", async () => {
    await expect(
      mcpOAuthService.resolveConsentRequest({
        consentCode: "consent-code",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({ code: "forbidden" })
  })

  test("rejects an expired consent code", async () => {
    mocks.findByIdentifier.mockResolvedValue({
      expiresAt: PAST,
      value: JSON.stringify({
        clientId: "client-1",
        requireConsent: true,
        userId: "user-1",
      }),
    })

    await expect(
      mcpOAuthService.resolveConsentRequest({
        consentCode: "consent-code",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "forbidden" })
  })
})

describe("mcpOAuthService.resolvePrincipal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Legacy consent (given before the workspace picker): no bound workspace.
    mocks.findLatestConsent.mockResolvedValue({ workspaceId: null })
  })

  test("returns invalidToken when the client has no given consent", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.findLatestConsent.mockResolvedValue(null)

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "no-consent" }),
    ).resolves.toEqual({ kind: "invalidToken" })
    expect(mocks.findLatestConsent).toHaveBeenCalledWith({
      userId: "user-1",
      clientId: "client-1",
    })
    expect(mocks.listByUserId).not.toHaveBeenCalled()
  })

  test("uses the consented workspace without a URL selection, even for a multi-workspace account", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.findLatestConsent.mockResolvedValue({ workspaceId: "ws-2" })
    const member = ownerAccess("ws-2")

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "valid" }),
    ).resolves.toEqual({
      kind: "principal",
      principal: {
        workspace: member.workspace,
        user,
        clientId: "client-1",
        accessTokenId: "at-1",
      },
    })
    expect(mocks.listByUserId).not.toHaveBeenCalled()
    expect(mocks.findMembership).toHaveBeenCalledWith({
      workspaceId: "ws-2",
      userId: user.id,
    })
  })

  test("an explicit workspace selection overrides the consented workspace", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.findLatestConsent.mockResolvedValue({ workspaceId: "ws-2" })
    ownerAccess("ws-3")

    await mcpOAuthService.resolvePrincipal({
      accessToken: "valid",
      workspaceId: "ws-3",
    })
    expect(mocks.findMembership).toHaveBeenCalledWith({
      workspaceId: "ws-3",
      userId: user.id,
    })
  })

  test("returns forbidden when the user is no longer an admin of the consented workspace", async () => {
    mocks.findByAccessToken.mockResolvedValue(accessToken())
    mocks.findByIdOrFail.mockResolvedValue(user)
    mocks.findLatestConsent.mockResolvedValue({ workspaceId: "ws-2" })
    const member = { role: "member", permissions: { superAdmin: false } }
    mocks.findMembership.mockResolvedValue(member)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "ws-2", name: "Beta" },
      member,
      isSupportSession: false,
    })

    await expect(
      mcpOAuthService.resolvePrincipal({ accessToken: "valid" }),
    ).resolves.toEqual({ kind: "forbidden" })
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
        permissions: {},
        role: "owner",
        workspaceId: "ws-deleting",
        workspace: {
          id: "ws-deleting",
          name: "Deleting",
          scheduledDeletionAt: new Date(),
        },
      },
      {
        permissions: {},
        role: "owner",
        workspaceId: "ws-1",
        workspace: { id: "ws-1", name: "Alpha" },
      },
      {
        permissions: {},
        role: "owner",
        workspaceId: "ws-2",
        workspace: { id: "ws-2", name: "Beta" },
      },
      {
        permissions: { superAdmin: false },
        role: "member",
        workspaceId: "ws-non-admin",
        workspace: { id: "ws-non-admin", name: "Agent only" },
      },
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
      permissions: {},
      role: "owner",
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

describe("mcpOAuthService.listGrantsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("lists a consent without a live token", async () => {
    const firstAuthorizedAt = new Date("2026-10-01T00:00:00.000Z")
    mocks.listGivenByUser.mockResolvedValue([
      {
        activeUntil: null,
        clientIcon: "https://example.com/icon.svg",
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt,
        lastRefreshedAt: null,
        scopes: "openid profile",
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
    expect(mocks.listGivenByUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
    )
  })

  test("keeps separate client grants and omits empty scopes", async () => {
    mocks.listGivenByUser.mockResolvedValue([
      {
        activeUntil: new Date("2026-11-01T00:00:00.000Z"),
        clientIcon: null,
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt: new Date("2026-10-01T00:00:00.000Z"),
        lastRefreshedAt: new Date("2026-10-02T00:00:00.000Z"),
        scopes: "openid profile",
      },
      {
        activeUntil: null,
        clientIcon: null,
        clientId: "cursor",
        clientName: "Cursor",
        firstAuthorizedAt: new Date("2026-10-03T00:00:00.000Z"),
        lastRefreshedAt: null,
        scopes: "",
      },
    ])

    await expect(
      mcpOAuthService.listGrantsForUser({ userId: "user-1" }),
    ).resolves.toEqual([
      expect.objectContaining({
        clientId: "claude",
        scopes: ["openid", "profile"],
      }),
      expect.objectContaining({ clientId: "cursor", scopes: [] }),
    ])
  })
})

describe("mcpOAuthService.revokeGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) => await callback({}))
  })

  test("returns true when revoking a consent without token rows", async () => {
    mocks.deleteByUserAndClient.mockResolvedValue(0)
    mocks.deleteConsentByUserAndClient.mockResolvedValue(1)

    await expect(
      mcpOAuthService.revokeGrant({ clientId: "claude", userId: "user-1" }),
    ).resolves.toBe(true)
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { clientId: "claude", deleted: 1, userId: "user-1" },
      "Revoked MCP OAuth grant",
    )
  })

  test("returns false and does not log when no grant rows exist", async () => {
    mocks.deleteByUserAndClient.mockResolvedValue(0)
    mocks.deleteConsentByUserAndClient.mockResolvedValue(0)

    await expect(
      mcpOAuthService.revokeGrant({ clientId: "foreign", userId: "user-1" }),
    ).resolves.toBe(false)
    expect(mocks.logInfo).not.toHaveBeenCalled()
  })

  test("propagates a consent deletion failure without logging", async () => {
    mocks.deleteByUserAndClient.mockResolvedValue(0)
    mocks.deleteConsentByUserAndClient.mockRejectedValue(new Error("database"))

    await expect(
      mcpOAuthService.revokeGrant({ clientId: "claude", userId: "user-1" }),
    ).rejects.toThrow("database")
    expect(mocks.logInfo).not.toHaveBeenCalled()
  })
})

describe("mcpOAuthService.listAuthorizableWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("lists only admin workspaces that are not scheduled for deletion", async () => {
    mocks.listByUserId.mockResolvedValue([
      {
        role: "owner",
        permissions: {},
        workspace: { id: "ws-1", name: "Owned" },
      },
      {
        role: "member",
        permissions: { superAdmin: true },
        workspace: { id: "ws-2", name: "Super admin" },
      },
      {
        role: "member",
        permissions: { superAdmin: false },
        workspace: { id: "ws-3", name: "Agent only" },
      },
      {
        role: "owner",
        permissions: {},
        workspace: {
          id: "ws-4",
          name: "Deleting",
          scheduledDeletionAt: new Date(),
        },
      },
    ])

    await expect(
      mcpOAuthService.listAuthorizableWorkspaces({ userId: "user-1" }),
    ).resolves.toEqual([
      { id: "ws-1", name: "Owned" },
      { id: "ws-2", name: "Super admin" },
    ])
  })
})

describe("mcpOAuthService.bindConsentWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("binds every consent the client holds for the user to an admin workspace", async () => {
    ownerAccess("ws-2")
    mocks.setConsentWorkspace.mockResolvedValue(2)

    await mcpOAuthService.bindConsentWorkspace({
      clientId: "claude",
      user,
      workspaceId: "ws-2",
    })
    expect(mocks.setConsentWorkspace).toHaveBeenCalledWith({
      userId: "user-1",
      clientId: "claude",
      workspaceId: "ws-2",
    })
  })

  test("rejects a workspace the user is not an admin of without writing", async () => {
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue(undefined)

    await expect(
      mcpOAuthService.bindConsentWorkspace({
        clientId: "claude",
        user,
        workspaceId: "ws-foreign",
      }),
    ).rejects.toMatchObject({ code: "forbidden" })
    expect(mocks.setConsentWorkspace).not.toHaveBeenCalled()
  })

  test("rejects a support session", async () => {
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "ws-2", name: "Beta" },
      member: { role: "owner", permissions: {} },
      isSupportSession: true,
    })

    await expect(
      mcpOAuthService.assertAuthorizableWorkspace({
        user,
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "forbidden" })
  })

  test("throws notFound when no given consent exists to bind", async () => {
    ownerAccess("ws-2")
    mocks.setConsentWorkspace.mockResolvedValue(0)

    await expect(
      mcpOAuthService.bindConsentWorkspace({
        clientId: "claude",
        user,
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
