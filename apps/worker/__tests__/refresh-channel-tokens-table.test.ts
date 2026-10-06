import { beforeEach, describe, expect, type Mock, test, vi } from "vitest"

const ROW_ONE_ID_PATTERN = /-1$/

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  runExclusive: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  logProviderError: vi.fn(),

  findMessengerAll: vi.fn(),
  findMessengerByIdForWorkspace: vi.fn(),
  updateMessengerAuth: vi.fn(),
  markMessengerTokenRefreshError: vi.fn(),
  refreshMessengerAuth: vi.fn(),
  isMessengerRevokedTokenError: vi.fn(() => false),

  findInstagramForTokenRefresh: vi.fn(),
  findInstagramByIdForWorkspace: vi.fn(),
  updateInstagramAuth: vi.fn(),
  markInstagramTokenRefreshError: vi.fn(),
  refreshInstagramAuth: vi.fn(),
  isInstagramRevokedTokenError: vi.fn(() => false),

  findInstagramFacebookForTokenRefresh: vi.fn(),
  refreshInstagramFacebookAuth: vi.fn(),
  isInstagramFacebookRevokedTokenError: vi.fn(() => false),

  findZaloAll: vi.fn(),
  findZaloById: vi.fn(),
  updateZaloAuth: vi.fn(),
  markZaloTokenRefreshError: vi.fn(),
  refreshZaloAccessToken: vi.fn(),
  calculateZaloExpiresAt: vi.fn(() => "2026-10-10T00:00:00.000Z"),
  isZaloRevokedTokenError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findAllForTokenRefresh: mocks.findMessengerAll,
    findByIdForWorkspace: mocks.findMessengerByIdForWorkspace,
    updateAuth: mocks.updateMessengerAuth,
    markTokenRefreshError: mocks.markMessengerTokenRefreshError,
  },
  instagramIntegrationService: {
    findForTokenRefresh: mocks.findInstagramForTokenRefresh,
    findFacebookForTokenRefresh: mocks.findInstagramFacebookForTokenRefresh,
    findByIdForWorkspace: mocks.findInstagramByIdForWorkspace,
    updateAuth: mocks.updateInstagramAuth,
    markTokenRefreshError: mocks.markInstagramTokenRefreshError,
  },
  zaloIntegrationService: {
    findAll: mocks.findZaloAll,
    findById: mocks.findZaloById,
    updateAuth: mocks.updateZaloAuth,
    markTokenRefreshError: mocks.markZaloTokenRefreshError,
  },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mocks.logProviderError,
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { refreshAuth: mocks.refreshMessengerAuth },
  isRevokedTokenError: mocks.isMessengerRevokedTokenError,
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { refreshAuth: mocks.refreshInstagramAuth },
  isRevokedTokenError: mocks.isInstagramRevokedTokenError,
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { refreshAuth: mocks.refreshInstagramFacebookAuth },
  isRevokedTokenError: mocks.isInstagramFacebookRevokedTokenError,
}))
vi.mock("@chatbotx.io/integration-zalo", () => ({
  refreshAccessToken: mocks.refreshZaloAccessToken,
  calculateExpiresAt: mocks.calculateZaloExpiresAt,
  isRevokedTokenError: mocks.isZaloRevokedTokenError,
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: <T>(
    _params: unknown,
    fn: () => Promise<T>,
  ): Promise<T> => fn(),
}))

// Dynamic `import()` is required here, not a static import: the `vi.mock`
// calls above must be registered before these SUTs (and their
// `@chatbotx.io/business`/integration-package dependencies) are evaluated,
// which only a post-`vi.mock` dynamic import guarantees.
const { refreshMessengerTokens } = await import(
  "../src/schedule/handlers/refresh-messenger-tokens"
)
const { refreshInstagramTokens } = await import(
  "../src/schedule/handlers/refresh-instagram-tokens"
)
const { refreshInstagramFacebookTokens } = await import(
  "../src/schedule/handlers/refresh-instagram-facebook-tokens"
)
const { refreshZaloTokens } = await import(
  "../src/schedule/handlers/refresh-zalo-tokens"
)

type ProviderCase = {
  name: string
  run: () => Promise<void>
  seedTwoRows: () => void
  refreshMock: Mock
  markErrorMock: Mock
  isRevokedMock: Mock
  updateAuthMock: Mock
}

const providerCases: ProviderCase[] = [
  {
    name: "Messenger",
    run: refreshMessengerTokens,
    seedTwoRows: () => {
      mocks.findMessengerAll.mockResolvedValue([
        { id: "messenger-1", workspaceId: "ws-1" },
        { id: "messenger-2", workspaceId: "ws-2" },
      ])
      mocks.findMessengerByIdForWorkspace.mockImplementation(
        async ({ id }: { id: string }) => ({ auth: { id } }),
      )
    },
    refreshMock: mocks.refreshMessengerAuth,
    markErrorMock: mocks.markMessengerTokenRefreshError,
    isRevokedMock: mocks.isMessengerRevokedTokenError,
    updateAuthMock: mocks.updateMessengerAuth,
  },
  {
    name: "Instagram",
    run: refreshInstagramTokens,
    seedTwoRows: () => {
      mocks.findInstagramForTokenRefresh.mockResolvedValue([
        { id: "instagram-1", workspaceId: "ws-1" },
        { id: "instagram-2", workspaceId: "ws-2" },
      ])
      mocks.findInstagramByIdForWorkspace.mockImplementation(
        async ({ id }: { id: string }) => ({ auth: { id } }),
      )
    },
    refreshMock: mocks.refreshInstagramAuth,
    markErrorMock: mocks.markInstagramTokenRefreshError,
    isRevokedMock: mocks.isInstagramRevokedTokenError,
    updateAuthMock: mocks.updateInstagramAuth,
  },
  {
    name: "Instagram (Facebook-linked)",
    run: refreshInstagramFacebookTokens,
    seedTwoRows: () => {
      mocks.findInstagramFacebookForTokenRefresh.mockResolvedValue([
        { id: "instagram-facebook-1", workspaceId: "ws-1" },
        { id: "instagram-facebook-2", workspaceId: "ws-2" },
      ])
      mocks.findInstagramByIdForWorkspace.mockImplementation(
        async ({ id }: { id: string }) => ({ auth: { id } }),
      )
    },
    refreshMock: mocks.refreshInstagramFacebookAuth,
    markErrorMock: mocks.markInstagramTokenRefreshError,
    isRevokedMock: mocks.isInstagramFacebookRevokedTokenError,
    updateAuthMock: mocks.updateInstagramAuth,
  },
  {
    name: "Zalo",
    run: refreshZaloTokens,
    seedTwoRows: () => {
      mocks.findZaloAll.mockResolvedValue([
        { id: "zalo-1", workspaceId: "ws-1" },
        { id: "zalo-2", workspaceId: "ws-2" },
      ])
      mocks.findZaloById.mockImplementation(async ({ id }: { id: string }) => ({
        auth: { id, tokens: { accessToken: "a", refreshToken: "r" } },
      }))
    },
    refreshMock: mocks.refreshZaloAccessToken,
    markErrorMock: mocks.markZaloTokenRefreshError,
    isRevokedMock: mocks.isZaloRevokedTokenError,
    updateAuthMock: mocks.updateZaloAuth,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMessengerAll.mockResolvedValue([])
  mocks.findInstagramForTokenRefresh.mockResolvedValue([])
  mocks.findInstagramFacebookForTokenRefresh.mockResolvedValue([])
  mocks.findZaloAll.mockResolvedValue([])
  mocks.refreshMessengerAuth.mockResolvedValue({ id: "refreshed" })
  mocks.refreshInstagramAuth.mockResolvedValue({ id: "refreshed" })
  mocks.refreshInstagramFacebookAuth.mockResolvedValue({ id: "refreshed" })
  mocks.refreshZaloAccessToken.mockResolvedValue({
    access_token: "new-token",
    refresh_token: "new-refresh",
    expires_in: 3600,
  })
})

describe.each(providerCases)("$name token refresh", ({
  name,
  run,
  seedTwoRows,
  refreshMock,
  markErrorMock,
  isRevokedMock,
}) => {
  test(`marks the row unhealthy with isRevoked: true when ${name}'s provider confirms the token was revoked`, async () => {
    seedTwoRows()
    refreshMock.mockRejectedValueOnce(new Error("revoked"))
    isRevokedMock.mockReturnValueOnce(true)

    await run()

    expect(markErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: "revoked", isRevoked: true }),
    )
  })

  test(`degrades with isRevoked: false on a transient ${name} refresh failure`, async () => {
    seedTwoRows()
    refreshMock.mockRejectedValueOnce(new Error("rate limited"))
    isRevokedMock.mockReturnValueOnce(false)

    await run()

    expect(markErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: "rate limited", isRevoked: false }),
    )
  })

  test(`isolates a row-1 failure: row-2 still refreshes in the same ${name} batch`, async () => {
    seedTwoRows()
    refreshMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(
      name === "Zalo"
        ? {
            access_token: "new-token-2",
            refresh_token: "new-refresh-2",
            expires_in: 3600,
          }
        : { id: "refreshed-2" },
    )

    await run()

    expect(markErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(ROW_ONE_ID_PATTERN),
      }),
    )
    expect(markErrorMock).toHaveBeenCalledTimes(1)
  })
})
