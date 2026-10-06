import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  isRevokedTokenError: vi.fn(() => false),
  logProviderError: vi.fn(),
  markTokenRefreshError: vi.fn(),
  parseTiktokScopes: vi.fn(() => ["user.info.basic"]),
  refreshAccessToken: vi.fn(),
  runExclusive: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  updateAuth: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  tiktokIntegrationService: {
    findAll: mocks.findAll,
    findById: mocks.findById,
    updateAuth: mocks.updateAuth,
    markTokenRefreshError: mocks.markTokenRefreshError,
  },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mocks.logProviderError,
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  isRevokedTokenError: mocks.isRevokedTokenError,
}))
vi.mock("@chatbotx.io/integration-tiktok/apis/auth", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
}))
vi.mock("@chatbotx.io/integration-tiktok/lib/scopes", () => ({
  parseTiktokScopes: mocks.parseTiktokScopes,
}))
vi.mock("@chatbotx.io/integration-tiktok/lib/token-utils", () => ({
  buildTokenTimestamps: vi.fn(() => ({
    expiresAt: "2026-10-10T00:00:00.000Z",
    refreshExpiresAt: "2027-10-10T00:00:00.000Z",
  })),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
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
// calls above must be registered before the SUT (and its
// `@chatbotx.io/business`/`@chatbotx.io/integration-tiktok`/`@chatbotx.io/redis`
// dependencies) is evaluated, which only a post-`vi.mock` dynamic import
// guarantees.
const { refreshTiktokTokens } = await import(
  "../src/schedule/handlers/refresh-tiktok-tokens"
)

const makeAuth = (accessToken: string) => ({
  clientId: "client-1",
  clientSecret: "secret-1",
  tokens: { accessToken, refreshToken: "refresh-1" },
  metadata: {},
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findAll.mockResolvedValue([])
  mocks.refreshAccessToken.mockResolvedValue({
    access_token: "new-token",
    refresh_token: "new-refresh",
    expires_in: 3600,
    refresh_expires_in: 86_400,
    scope: "user.info.basic",
  })
  mocks.isRevokedTokenError.mockReturnValue(false)
})

describe("refreshTiktokTokens", () => {
  test("refreshes and writes an updateAuth payload carrying workspaceId and the parsed scopes", async () => {
    mocks.findAll.mockResolvedValue([{ id: "tiktok-1", workspaceId: "ws-1" }])
    mocks.findById.mockResolvedValue({ auth: makeAuth("old-token") })

    await refreshTiktokTokens()

    expect(mocks.updateAuth).toHaveBeenCalledWith({
      id: "tiktok-1",
      workspaceId: "ws-1",
      auth: expect.objectContaining({
        tokens: expect.objectContaining({ accessToken: "new-token" }),
        metadata: expect.objectContaining({ scopes: ["user.info.basic"] }),
      }),
    })
    expect(mocks.markTokenRefreshError).not.toHaveBeenCalled()
  })

  test("marks the Connection unhealthy with isRevoked: true when the provider confirms the token was revoked", async () => {
    mocks.findAll.mockResolvedValue([{ id: "tiktok-1", workspaceId: "ws-1" }])
    mocks.findById.mockResolvedValue({ auth: makeAuth("old-token") })
    mocks.refreshAccessToken.mockRejectedValue(new Error("revoked"))
    mocks.isRevokedTokenError.mockReturnValue(true)

    await refreshTiktokTokens()

    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith({
      id: "tiktok-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })
  })

  test("degrades with isRevoked: false on a transient refresh failure", async () => {
    mocks.findAll.mockResolvedValue([{ id: "tiktok-1", workspaceId: "ws-1" }])
    mocks.findById.mockResolvedValue({ auth: makeAuth("old-token") })
    mocks.refreshAccessToken.mockRejectedValue(new Error("rate limited"))
    mocks.isRevokedTokenError.mockReturnValue(false)

    await refreshTiktokTokens()

    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith({
      id: "tiktok-1",
      workspaceId: "ws-1",
      error: "rate limited",
      isRevoked: false,
    })
  })

  test("isolates a row-1 failure: row-2 still refreshes in the same batch", async () => {
    mocks.findAll.mockResolvedValue([
      { id: "tiktok-1", workspaceId: "ws-1" },
      { id: "tiktok-2", workspaceId: "ws-2" },
    ])
    mocks.findById.mockImplementation(async ({ id }: { id: string }) => ({
      auth: makeAuth(`old-token-${id}`),
    }))
    mocks.refreshAccessToken
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        access_token: "new-token-2",
        refresh_token: "new-refresh-2",
        expires_in: 3600,
        refresh_expires_in: 86_400,
        scope: "user.info.basic",
      })

    await refreshTiktokTokens()

    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tiktok-1", error: "boom" }),
    )
    expect(mocks.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tiktok-2" }),
    )
  })

  test("skips a row with no refreshToken without marking an error", async () => {
    mocks.findAll.mockResolvedValue([{ id: "tiktok-1", workspaceId: "ws-1" }])
    mocks.findById.mockResolvedValue({
      auth: { ...makeAuth("old-token"), tokens: { accessToken: "old-token" } },
    })

    await refreshTiktokTokens()

    expect(mocks.refreshAccessToken).not.toHaveBeenCalled()
    expect(mocks.updateAuth).not.toHaveBeenCalled()
    expect(mocks.markTokenRefreshError).not.toHaveBeenCalled()
  })
})
