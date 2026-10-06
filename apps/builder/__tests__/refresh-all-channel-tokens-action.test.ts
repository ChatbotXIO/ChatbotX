// @vitest-environment node

import { beforeEach, describe, expect, type Mock, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  lock: { held: false },
  findMessengerByIdForWorkspace: vi.fn(),
  findMessengerForTokenRefresh: vi.fn(),
  logMessengerWelcomeProfile: vi.fn(),
  markMessengerTokenRefreshError: vi.fn(),
  refreshMessengerAuth: vi.fn(),
  updateMessengerAuth: vi.fn(),
  isMessengerRevokedTokenError: vi.fn(() => false),
  findInstagramByWorkspaceIds: vi.fn().mockResolvedValue([]),
  findInstagramFacebookByWorkspaceIds: vi.fn().mockResolvedValue([]),
  findInstagramByIdForWorkspace: vi.fn(),
  updateInstagramAuth: vi.fn(),
  markInstagramTokenRefreshError: vi.fn(),
  refreshInstagramAuth: vi.fn(),
  isInstagramRevokedTokenError: vi.fn(() => false),
  refreshInstagramFacebookAuth: vi.fn(),
  isInstagramFacebookRevokedTokenError: vi.fn(() => false),
  findWhatsappByWorkspaceIds: vi.fn().mockResolvedValue([]),
  findWhatsappByIdForWorkspace: vi.fn(),
  updateWhatsappAuth: vi.fn(),
  markWhatsappTokenRefreshError: vi.fn(),
  refreshWhatsappAuth: vi.fn(),
  isWhatsappRevokedTokenError: vi.fn(() => false),
  findTiktokByWorkspaceIds: vi.fn().mockResolvedValue([]),
  findTiktokById: vi.fn(),
  updateTiktokAuth: vi.fn(),
  markTiktokTokenRefreshError: vi.fn(),
  refreshTiktokAccessToken: vi.fn(),
  isTiktokRevokedTokenError: vi.fn(() => false),
  findZaloByWorkspaceIds: vi.fn().mockResolvedValue([]),
  findZaloById: vi.fn(),
  updateZaloAuth: vi.fn(),
  markZaloTokenRefreshError: vi.fn(),
  refreshZaloAccessToken: vi.fn(),
  isZaloRevokedTokenError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    findForTokenRefreshByWorkspaceIds: mocks.findInstagramByWorkspaceIds,
    findFacebookForTokenRefreshByWorkspaceIds:
      mocks.findInstagramFacebookByWorkspaceIds,
    findByIdForWorkspace: mocks.findInstagramByIdForWorkspace,
    updateAuth: mocks.updateInstagramAuth,
    markTokenRefreshError: mocks.markInstagramTokenRefreshError,
  },
  integrationWhatsappService: {
    findForTokenRefreshByWorkspaceIds: mocks.findWhatsappByWorkspaceIds,
    findByIdForWorkspace: mocks.findWhatsappByIdForWorkspace,
    updateAuth: mocks.updateWhatsappAuth,
    markTokenRefreshError: mocks.markWhatsappTokenRefreshError,
  },
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  messengerIntegrationService: {
    findForTokenRefreshByWorkspaceIds: mocks.findMessengerForTokenRefresh,
    findByIdForWorkspace: mocks.findMessengerByIdForWorkspace,
    updateAuth: mocks.updateMessengerAuth,
    markTokenRefreshError: mocks.markMessengerTokenRefreshError,
  },
  tiktokIntegrationService: {
    findAllByWorkspaceIds: mocks.findTiktokByWorkspaceIds,
    findById: mocks.findTiktokById,
    updateAuth: mocks.updateTiktokAuth,
    markTokenRefreshError: mocks.markTiktokTokenRefreshError,
  },
  zaloIntegrationService: {
    findAllByWorkspaceIds: mocks.findZaloByWorkspaceIds,
    findById: mocks.findZaloById,
    updateAuth: mocks.updateZaloAuth,
    markTokenRefreshError: mocks.markZaloTokenRefreshError,
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { refreshAuth: mocks.refreshInstagramAuth },
  isRevokedTokenError: mocks.isInstagramRevokedTokenError,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { refreshAuth: mocks.refreshInstagramFacebookAuth },
  isRevokedTokenError: mocks.isInstagramFacebookRevokedTokenError,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { refreshAuth: mocks.refreshMessengerAuth },
  logMessengerWelcomeProfile: mocks.logMessengerWelcomeProfile,
  isRevokedTokenError: mocks.isMessengerRevokedTokenError,
}))

vi.mock("@chatbotx.io/integration-tiktok", () => ({
  isRevokedTokenError: mocks.isTiktokRevokedTokenError,
}))

vi.mock("@chatbotx.io/integration-tiktok/apis/auth", () => ({
  refreshAccessToken: mocks.refreshTiktokAccessToken,
}))

vi.mock("@chatbotx.io/integration-tiktok/lib/token-utils", () => ({
  buildTokenTimestamps: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  integration: { refreshAuth: mocks.refreshWhatsappAuth },
  isRevokedTokenError: mocks.isWhatsappRevokedTokenError,
}))

vi.mock("@chatbotx.io/integration-zalo", () => ({
  calculateExpiresAt: vi.fn(() => "2026-10-10T00:00:00.000Z"),
  refreshAccessToken: mocks.refreshZaloAccessToken,
  isRevokedTokenError: mocks.isZaloRevokedTokenError,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: async ({ fn }: { fn: () => Promise<unknown> }) => {
      mocks.lock.held = true
      try {
        return await fn()
      } finally {
        mocks.lock.held = false
      }
    },
  },
}))

vi.mock("@/env", () => ({ isCloud: vi.fn(() => false) }))

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn().mockResolvedValue({
    workspaces: [{ id: "ws-1", ownerId: "owner-1" }],
  }),
}))

vi.mock("@/lib/safe-action", () => ({
  authActionClient: { action: vi.fn((handler: unknown) => handler) },
}))

vi.mock("@/lib/workspace-quota", () => ({
  resolveWorkspaceBlockState: vi.fn(),
}))

const { refreshAllChannelTokensAction } = await import(
  "../src/features/workspaces/actions/refresh-all-channel-tokens.action"
)

type RefreshAction = (props: {
  ctx: { user: { id: string } }
}) => Promise<{ refreshed: number; failed: number }>

const runRefresh = () =>
  (refreshAllChannelTokensAction as unknown as RefreshAction)({
    ctx: { user: { id: "user-1" } },
  })

const oldAuth = { tokens: { accessToken: "old-token" } }
const newAuth = {
  tokens: { accessToken: "new-token" },
  metadata: { pageId: "page-1" },
}

describe("refreshAllChannelTokensAction — Messenger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMessengerForTokenRefresh.mockResolvedValue([
      { id: "messenger-1", workspaceId: "ws-1" },
    ])
    mocks.findMessengerByIdForWorkspace.mockResolvedValue({ auth: oldAuth })
    mocks.refreshMessengerAuth.mockResolvedValue(newAuth)
    mocks.updateMessengerAuth.mockResolvedValue(undefined)
    mocks.auditRecord.mockResolvedValue(undefined)
    mocks.logMessengerWelcomeProfile.mockResolvedValue(undefined)
  })

  test("reads the welcome profile with the refreshed token after saving it", async () => {
    const summary = await runRefresh()

    expect(summary).toEqual({ refreshed: 1, failed: 0 })
    expect(mocks.logMessengerWelcomeProfile).toHaveBeenCalledWith({
      ctx: { auth: newAuth },
      reason: "tokenRefreshed",
    })
    expect(mocks.updateMessengerAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.logMessengerWelcomeProfile.mock.invocationCallOrder[0],
    )
  })

  test("reads the welcome profile only after the refresh lock is released", async () => {
    let lockHeldDuringRead: boolean | undefined
    mocks.logMessengerWelcomeProfile.mockImplementation(() => {
      lockHeldDuringRead = mocks.lock.held
      return Promise.resolve()
    })

    await runRefresh()

    expect(lockHeldDuringRead).toBe(false)
  })

  test("skips the profile read when the token refresh fails", async () => {
    mocks.refreshMessengerAuth.mockRejectedValue(new Error("token expired"))

    const summary = await runRefresh()

    expect(summary).toEqual({ refreshed: 0, failed: 1 })
    expect(mocks.markMessengerTokenRefreshError).toHaveBeenCalledWith({
      id: "messenger-1",
      workspaceId: "ws-1",
      error: "token expired",
      isRevoked: false,
    })
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })

  test("skips the profile read when the integration no longer exists", async () => {
    mocks.findMessengerByIdForWorkspace.mockResolvedValue(null)

    const summary = await runRefresh()

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })
})

type ProviderErrorCase = {
  name: string
  setup: () => void
  fail: (error: Error) => void
  markErrorMock: Mock
  isRevokedMock: Mock
}

const resetAllProviderListsToEmpty = () => {
  mocks.findZaloByWorkspaceIds.mockResolvedValue([])
  mocks.findTiktokByWorkspaceIds.mockResolvedValue([])
  mocks.findInstagramByWorkspaceIds.mockResolvedValue([])
  mocks.findInstagramFacebookByWorkspaceIds.mockResolvedValue([])
  mocks.findWhatsappByWorkspaceIds.mockResolvedValue([])
  mocks.findMessengerForTokenRefresh.mockResolvedValue([])
}

const providerErrorCases: ProviderErrorCase[] = [
  {
    name: "Zalo",
    setup: () => {
      mocks.findZaloByWorkspaceIds.mockResolvedValue([
        { id: "zalo-1", workspaceId: "ws-1" },
      ])
      mocks.findZaloById.mockResolvedValue({
        auth: { tokens: { accessToken: "a", refreshToken: "r" } },
      })
    },
    fail: (error) => mocks.refreshZaloAccessToken.mockRejectedValue(error),
    markErrorMock: mocks.markZaloTokenRefreshError,
    isRevokedMock: mocks.isZaloRevokedTokenError,
  },
  {
    name: "TikTok",
    setup: () => {
      mocks.findTiktokByWorkspaceIds.mockResolvedValue([
        { id: "tiktok-1", workspaceId: "ws-1" },
      ])
      mocks.findTiktokById.mockResolvedValue({
        auth: {
          clientId: "client-1",
          clientSecret: "secret-1",
          tokens: { accessToken: "a", refreshToken: "r" },
        },
      })
    },
    fail: (error) => mocks.refreshTiktokAccessToken.mockRejectedValue(error),
    markErrorMock: mocks.markTiktokTokenRefreshError,
    isRevokedMock: mocks.isTiktokRevokedTokenError,
  },
  {
    name: "Instagram",
    setup: () => {
      mocks.findInstagramByWorkspaceIds.mockResolvedValue([
        { id: "instagram-1", workspaceId: "ws-1" },
      ])
      mocks.findInstagramByIdForWorkspace.mockResolvedValue({ auth: {} })
    },
    fail: (error) => mocks.refreshInstagramAuth.mockRejectedValue(error),
    markErrorMock: mocks.markInstagramTokenRefreshError,
    isRevokedMock: mocks.isInstagramRevokedTokenError,
  },
  {
    name: "Instagram (Facebook-linked)",
    setup: () => {
      mocks.findInstagramFacebookByWorkspaceIds.mockResolvedValue([
        { id: "instagram-facebook-1", workspaceId: "ws-1" },
      ])
      mocks.findInstagramByIdForWorkspace.mockResolvedValue({ auth: {} })
    },
    fail: (error) =>
      mocks.refreshInstagramFacebookAuth.mockRejectedValue(error),
    markErrorMock: mocks.markInstagramTokenRefreshError,
    isRevokedMock: mocks.isInstagramFacebookRevokedTokenError,
  },
  {
    name: "WhatsApp",
    setup: () => {
      mocks.findWhatsappByWorkspaceIds.mockResolvedValue([
        { id: "whatsapp-1", workspaceId: "ws-1" },
      ])
      mocks.findWhatsappByIdForWorkspace.mockResolvedValue({
        auth: { metadata: { isManual: false } },
      })
    },
    fail: (error) => mocks.refreshWhatsappAuth.mockRejectedValue(error),
    markErrorMock: mocks.markWhatsappTokenRefreshError,
    isRevokedMock: mocks.isWhatsappRevokedTokenError,
  },
  {
    name: "Messenger",
    setup: () => {
      mocks.findMessengerForTokenRefresh.mockResolvedValue([
        { id: "messenger-1", workspaceId: "ws-1" },
      ])
      mocks.findMessengerByIdForWorkspace.mockResolvedValue({ auth: {} })
    },
    fail: (error) => mocks.refreshMessengerAuth.mockRejectedValue(error),
    markErrorMock: mocks.markMessengerTokenRefreshError,
    isRevokedMock: mocks.isMessengerRevokedTokenError,
  },
]

describe.each(
  providerErrorCases,
)("refreshAllChannelTokensAction — $name error branch", ({
  name,
  setup,
  fail,
  markErrorMock,
  isRevokedMock,
}) => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllProviderListsToEmpty()
    setup()
  })

  test(`reports a failure and records the ${name} token refresh error with the provider's isRevoked signal`, async () => {
    const error = new Error(`${name} provider rejected the refresh`)
    fail(error)
    isRevokedMock.mockReturnValue(true)

    const summary = await runRefresh()

    expect(summary.failed).toBe(1)
    expect(summary.refreshed).toBe(0)
    expect(markErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: error.message,
        isRevoked: true,
      }),
    )
  })

  test(`reports isRevoked: false when the provider's revocation check says so`, async () => {
    fail(new Error("transient failure"))
    isRevokedMock.mockReturnValue(false)

    await runRefresh()

    expect(markErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ isRevoked: false }),
    )
  })
})
