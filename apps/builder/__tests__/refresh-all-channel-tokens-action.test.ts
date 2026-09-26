// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emptyList: () => vi.fn().mockResolvedValue([]),
  auditRecord: vi.fn(),
  lock: { held: false },
  findMessengerByIdForWorkspace: vi.fn(),
  findMessengerForTokenRefresh: vi.fn(),
  logMessengerWelcomeProfile: vi.fn(),
  markMessengerTokenRefreshError: vi.fn(),
  refreshMessengerAuth: vi.fn(),
  updateMessengerAuth: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    findForTokenRefreshByWorkspaceIds: mocks.emptyList(),
    findFacebookForTokenRefreshByWorkspaceIds: mocks.emptyList(),
  },
  integrationWhatsappService: {
    findForTokenRefreshByWorkspaceIds: mocks.emptyList(),
  },
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  messengerIntegrationService: {
    findForTokenRefreshByWorkspaceIds: mocks.findMessengerForTokenRefresh,
    findByIdForWorkspace: mocks.findMessengerByIdForWorkspace,
    updateAuth: mocks.updateMessengerAuth,
    markTokenRefreshError: mocks.markMessengerTokenRefreshError,
  },
  tiktokIntegrationService: { findAllByWorkspaceIds: mocks.emptyList() },
  zaloIntegrationService: { findAllByWorkspaceIds: mocks.emptyList() },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: {},
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: {},
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { refreshAuth: mocks.refreshMessengerAuth },
  logMessengerWelcomeProfile: mocks.logMessengerWelcomeProfile,
}))

vi.mock("@chatbotx.io/integration-tiktok/apis/auth", () => ({
  refreshAccessToken: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-tiktok/lib/token-utils", () => ({
  buildTokenTimestamps: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  integration: {},
}))

vi.mock("@chatbotx.io/integration-zalo", () => ({
  calculateExpiresAt: vi.fn(),
  refreshAccessToken: vi.fn(),
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
    expect(mocks.markMessengerTokenRefreshError).toHaveBeenCalledWith(
      "messenger-1",
      "token expired",
    )
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })

  test("skips the profile read when the integration no longer exists", async () => {
    mocks.findMessengerByIdForWorkspace.mockResolvedValue(null)

    const summary = await runRefresh()

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })
})
