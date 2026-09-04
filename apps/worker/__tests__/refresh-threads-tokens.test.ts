import { beforeEach, describe, expect, test, vi } from "vitest"

const listDueForTokenRefresh = vi.fn()
const updateAuthIfAccessTokenMatches = vi.fn()
const refreshAccessToken = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const info = vi.fn()
const error = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  THREADS_TOKEN_REFRESH_THRESHOLD_DAYS: 14,
  integrationThreadsService: {
    listDueForTokenRefresh,
    updateAuthIfAccessTokenMatches,
  },
}))
vi.mock("@chatbotx.io/integration-threads", () => ({
  refreshAccessToken,
}))
vi.mock("@chatbotx.io/redis", () => ({ distributedLock: { runExclusive } }))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, error }),
}))

const { refreshThreadsTokens } = await import(
  "../src/schedule/handlers/refresh-threads-tokens"
)

beforeEach(() => {
  vi.clearAllMocks()
  listDueForTokenRefresh.mockResolvedValue([])
  updateAuthIfAccessTokenMatches.mockResolvedValue(true)
  refreshAccessToken.mockResolvedValue({
    accessToken: "refreshed-token",
    expiresAt: "2026-10-01T00:00:00.000Z",
  })
})

describe("refreshThreadsTokens", () => {
  test("runs under the distributed lock and refreshes due integrations", async () => {
    listDueForTokenRefresh.mockResolvedValue([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        currentAccessToken: "token-1",
        auth: {
          tokens: {
            accessToken: "token-1",
            expiresAt: "2026-08-15T00:00:00.000Z",
          },
          metadata: { version: "v1.0" },
        },
      },
    ])

    await refreshThreadsTokens()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:refresh-threads-tokens",
        timeoutInSeconds: 1800,
      }),
    )
    expect(listDueForTokenRefresh).toHaveBeenCalledWith({
      refreshBefore: expect.any(Date),
    })
    expect(refreshAccessToken).toHaveBeenCalledWith({
      accessToken: "token-1",
    })
    expect(updateAuthIfAccessTokenMatches).toHaveBeenCalledWith({
      id: "threads-1",
      workspaceId: "workspace-1",
      expectedCurrentAccessToken: "token-1",
      auth: {
        tokens: {
          accessToken: "refreshed-token",
          expiresAt: "2026-10-01T00:00:00.000Z",
        },
        metadata: { version: "v1.0" },
      },
    })
  })

  test("logs a stale skip when compare-and-set refuses to overwrite a reconnect", async () => {
    listDueForTokenRefresh.mockResolvedValue([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        currentAccessToken: "token-1",
        auth: { tokens: { accessToken: "token-1" } },
      },
    ])
    updateAuthIfAccessTokenMatches.mockResolvedValue(false)

    await refreshThreadsTokens()

    expect(info).toHaveBeenCalledWith(
      { integrationId: "threads-1", workspaceId: "workspace-1" },
      "refreshThreadsTokens: skipped stale integration",
    )
  })

  test("isolates per-integration failures and continues refreshing later rows", async () => {
    listDueForTokenRefresh.mockResolvedValue([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        currentAccessToken: "token-1",
        auth: { tokens: { accessToken: "token-1" } },
      },
      {
        id: "threads-2",
        workspaceId: "workspace-2",
        currentAccessToken: "token-2",
        auth: { tokens: { accessToken: "token-2" } },
      },
    ])
    const refreshError = Object.assign(new Error("revoked"), {
      code: "TOKEN_REVOKED",
      status: 401,
      request: {
        url: "https://graph.threads.com/refresh_access_token?access_token=token-1",
      },
    })
    refreshAccessToken
      .mockRejectedValueOnce(refreshError)
      .mockResolvedValueOnce({
        accessToken: "refreshed-token-2",
        expiresAt: "2026-10-02T00:00:00.000Z",
      })

    await refreshThreadsTokens()

    expect(error).toHaveBeenCalledWith(
      {
        errorCode: "TOKEN_REVOKED",
        errorName: "Error",
        errorStatus: 401,
        integrationId: "threads-1",
        workspaceId: "workspace-1",
      },
      "refreshThreadsTokens: integration refresh failed",
    )
    expect(JSON.stringify(error.mock.calls[0]?.[0])).not.toContain("token-1")
    expect(error.mock.calls[0]?.[0]).not.toHaveProperty("err")
    expect(updateAuthIfAccessTokenMatches).toHaveBeenCalledTimes(1)
    expect(updateAuthIfAccessTokenMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "threads-2",
        workspaceId: "workspace-2",
        expectedCurrentAccessToken: "token-2",
      }),
    )
  })
})
