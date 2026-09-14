import { beforeEach, describe, expect, test, vi } from "vitest"

const zaloIntegrationService = {
  findAllByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findById: vi.fn(),
  updateAuth: vi.fn(async () => undefined),
  markTokenRefreshError: vi.fn(async () => undefined),
}
vi.mock("../src/integration-zalo/service", () => ({ zaloIntegrationService }))

const tiktokIntegrationService = {
  findAllByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findById: vi.fn(),
  updateAuth: vi.fn(async () => undefined),
  markTokenRefreshError: vi.fn(async () => undefined),
}
vi.mock("../src/integration-tiktok/service", () => ({
  tiktokIntegrationService,
}))

const instagramIntegrationService = {
  findForTokenRefreshByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findFacebookForTokenRefreshByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findByIdForWorkspace: vi.fn(),
  updateAuth: vi.fn(async () => undefined),
  markTokenRefreshError: vi.fn(async () => undefined),
}
vi.mock("../src/integration-instagram/service", () => ({
  instagramIntegrationService,
}))

const messengerIntegrationService = {
  findForTokenRefreshByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findByIdForWorkspace: vi.fn(),
  updateAuth: vi.fn(async () => undefined),
  markTokenRefreshError: vi.fn(async () => undefined),
}
vi.mock("../src/integration-messenger/service", () => ({
  messengerIntegrationService,
}))

const integrationWhatsappService = {
  findForTokenRefreshByWorkspaceIds: vi.fn(
    async (_workspaceIds: string[]) => [] as never[],
  ),
  findByIdForWorkspace: vi.fn(),
  updateAuth: vi.fn(async () => undefined),
  markTokenRefreshError: vi.fn(async () => undefined),
}
vi.mock("../src/integration-whatsapp/service", () => ({
  integrationWhatsappService,
}))

const dispatchAuditRecord = vi.fn(async () => undefined)
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const distributedLock = {
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
}
vi.mock("@chatbotx.io/redis", () => ({ distributedLock }))

const refreshZaloAccessToken = vi.fn(async () => ({
  access_token: "new-zalo-access",
  refresh_token: "new-zalo-refresh",
  expires_in: 3600,
}))
vi.mock("@chatbotx.io/integration-zalo", () => ({
  refreshAccessToken: refreshZaloAccessToken,
  calculateExpiresAt: (expiresIn: number) =>
    new Date(Date.now() + expiresIn * 1000).toISOString(),
}))

const refreshTiktokAccessToken = vi.fn(async () => ({
  access_token: "new-tiktok-access",
  refresh_token: "new-tiktok-refresh",
  expires_in: 3600,
  refresh_expires_in: 86_400,
}))
vi.mock("@chatbotx.io/integration-tiktok/apis/auth", () => ({
  refreshAccessToken: refreshTiktokAccessToken,
}))
vi.mock("@chatbotx.io/integration-tiktok/lib/token-utils", () => ({
  buildTokenTimestamps: (expiresIn: number, refreshExpiresIn: number) => ({
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(
      Date.now() + refreshExpiresIn * 1000,
    ).toISOString(),
  }),
}))

const { channelTokenRefreshService } = await import(
  "../src/workspace/channel-token-refresh"
)

const refreshAuthCallback = vi.fn(async (auth: Record<string, unknown>) => ({
  ...auth,
  accessToken: "refreshed-provider-token",
}))

beforeEach(() => {
  vi.clearAllMocks()
  distributedLock.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([])
  tiktokIntegrationService.findAllByWorkspaceIds.mockResolvedValue([])
  instagramIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
    [],
  )
  instagramIntegrationService.findFacebookForTokenRefreshByWorkspaceIds.mockResolvedValue(
    [],
  )
  messengerIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
    [],
  )
  integrationWhatsappService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
    [],
  )
})

describe("channelTokenRefreshService.refreshWorkspace — per-provider branches", () => {
  test("zalo: refreshes an integration with a refresh token and audits it", async () => {
    zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "zalo-1",
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: "rt-1" } },
      },
    ])
    zaloIntegrationService.findById.mockResolvedValue({
      id: "zalo-1",
      workspaceId: "ws-1",
      auth: { tokens: { refreshToken: "rt-1" } },
    })

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    expect(summary).toEqual({ refreshed: 1, failed: 0 })
    expect(zaloIntegrationService.updateAuth).toHaveBeenCalledWith(
      "zalo-1",
      expect.objectContaining({
        tokens: expect.objectContaining({ accessToken: "new-zalo-access" }),
      }),
    )
    expect(dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", action: "refresh" }),
    )
  })

  test("zalo: skips an integration with no stored refresh token", async () => {
    zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      { id: "zalo-2", workspaceId: "ws-1", auth: { tokens: {} } },
    ])
    zaloIntegrationService.findById.mockResolvedValue({
      id: "zalo-2",
      workspaceId: "ws-1",
      auth: { tokens: {} },
    })

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(zaloIntegrationService.updateAuth).not.toHaveBeenCalled()
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("zalo: a provider failure marks the integration failed instead of throwing", async () => {
    zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "zalo-3",
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: "rt-3" } },
      },
    ])
    zaloIntegrationService.findById.mockResolvedValue({
      id: "zalo-3",
      workspaceId: "ws-1",
      auth: { tokens: { refreshToken: "rt-3" } },
    })
    refreshZaloAccessToken.mockRejectedValueOnce(new Error("provider down"))

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    expect(summary).toEqual({ refreshed: 0, failed: 1 })
    expect(zaloIntegrationService.markTokenRefreshError).toHaveBeenCalledWith(
      "zalo-3",
      "provider down",
    )
  })

  test("tiktok: refreshes and persists both new tokens plus expiry timestamps", async () => {
    tiktokIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "tiktok-1",
        workspaceId: "ws-1",
        auth: {
          clientId: "cid",
          clientSecret: "secret",
          tokens: { refreshToken: "rt-1" },
        },
      },
    ])
    tiktokIntegrationService.findById.mockResolvedValue({
      id: "tiktok-1",
      workspaceId: "ws-1",
      auth: {
        clientId: "cid",
        clientSecret: "secret",
        tokens: { refreshToken: "rt-1" },
      },
    })

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    expect(summary).toEqual({ refreshed: 1, failed: 0 })
    expect(tiktokIntegrationService.updateAuth).toHaveBeenCalledWith(
      "tiktok-1",
      expect.objectContaining({
        tokens: expect.objectContaining({
          accessToken: "new-tiktok-access",
          refreshToken: "new-tiktok-refresh",
        }),
      }),
    )
  })

  test("instagram/messenger/whatsapp: skip entirely without a refreshAuth callback", async () => {
    instagramIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
      [{ id: "ig-1", workspaceId: "ws-1", auth: {} }],
    )
    messengerIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
      [{ id: "msg-1", workspaceId: "ws-1", auth: {} }],
    )

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    // The callback-less providers must never even query for candidates —
    // this is the short-circuit at the top of each `refreshXIntegrations`.
    expect(
      instagramIntegrationService.findForTokenRefreshByWorkspaceIds,
    ).not.toHaveBeenCalled()
    expect(
      messengerIntegrationService.findForTokenRefreshByWorkspaceIds,
    ).not.toHaveBeenCalled()
  })

  test("messenger: refreshes via the injected auth callback", async () => {
    messengerIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
      [{ id: "msg-1", workspaceId: "ws-1", auth: { pageAccessToken: "old" } }],
    )
    messengerIntegrationService.findByIdForWorkspace.mockResolvedValue({
      id: "msg-1",
      workspaceId: "ws-1",
      auth: { pageAccessToken: "old" },
    })

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
      refreshMessengerAuth: refreshAuthCallback,
    })

    expect(summary).toEqual({ refreshed: 1, failed: 0 })
    expect(refreshAuthCallback).toHaveBeenCalledWith({
      pageAccessToken: "old",
    })
    expect(messengerIntegrationService.updateAuth).toHaveBeenCalledWith({
      id: "msg-1",
      workspaceId: "ws-1",
      auth: { pageAccessToken: "old", accessToken: "refreshed-provider-token" },
    })
  })

  test("messenger: a deleted integration (findByIdForWorkspace -> null) is skipped, not failed", async () => {
    messengerIntegrationService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
      [{ id: "msg-2", workspaceId: "ws-1", auth: {} }],
    )
    messengerIntegrationService.findByIdForWorkspace.mockResolvedValue(null)

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
      refreshMessengerAuth: refreshAuthCallback,
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(refreshAuthCallback).not.toHaveBeenCalled()
    expect(
      messengerIntegrationService.markTokenRefreshError,
    ).not.toHaveBeenCalled()
  })

  test("whatsapp: a manually-authenticated integration is skipped, never refreshed", async () => {
    integrationWhatsappService.findForTokenRefreshByWorkspaceIds.mockResolvedValue(
      [
        {
          id: "wa-1",
          workspaceId: "ws-1",
          auth: { metadata: { isManual: true } },
        },
      ],
    )
    integrationWhatsappService.findByIdForWorkspace.mockResolvedValue({
      id: "wa-1",
      workspaceId: "ws-1",
      auth: { metadata: { isManual: true } },
    })

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
      refreshWhatsappAuth: refreshAuthCallback,
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(refreshAuthCallback).not.toHaveBeenCalled()
    expect(integrationWhatsappService.updateAuth).not.toHaveBeenCalled()
  })

  test("a lock-acquisition rejection for one integration fails only that item (runInBatches isolation)", async () => {
    zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "zalo-ok",
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: "rt-ok" } },
      },
      {
        id: "zalo-lock-timeout",
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: "rt-timeout" } },
      },
    ])
    zaloIntegrationService.findById.mockImplementation(
      async ({ id }: { id: string }) => ({
        id,
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: `rt-${id}` } },
      }),
    )
    distributedLock.runExclusive.mockImplementation(
      async ({ key, fn }: { key: string; fn: () => Promise<unknown> }) => {
        if (key.includes("zalo-lock-timeout")) {
          throw new Error("lock acquisition timed out")
        }
        return await fn()
      },
    )

    const summary = await channelTokenRefreshService.refreshWorkspace({
      workspaceId: "ws-1",
    })

    // `runInBatches`' per-item `.catch(() => "failed")` must isolate the
    // rejected lock acquisition from the sibling integration that
    // succeeded — a single bad lock must never fail the whole batch.
    expect(summary).toEqual({ refreshed: 1, failed: 1 })
  })
})

describe("channelTokenRefreshService.refreshWorkspaces — cross-workspace batching", () => {
  test("queries each provider once with every workspace id instead of once per workspace", async () => {
    const summary = await channelTokenRefreshService.refreshWorkspaces({
      workspaceIds: ["ws-1", "ws-2", "ws-3"],
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(zaloIntegrationService.findAllByWorkspaceIds).toHaveBeenCalledTimes(
      1,
    )
    expect(zaloIntegrationService.findAllByWorkspaceIds).toHaveBeenCalledWith([
      "ws-1",
      "ws-2",
      "ws-3",
    ])
    expect(
      tiktokIntegrationService.findAllByWorkspaceIds,
    ).toHaveBeenCalledTimes(1)
    expect(tiktokIntegrationService.findAllByWorkspaceIds).toHaveBeenCalledWith(
      ["ws-1", "ws-2", "ws-3"],
    )
  })

  test("returns a zero summary and skips every provider query for an empty id list", async () => {
    const summary = await channelTokenRefreshService.refreshWorkspaces({
      workspaceIds: [],
    })

    expect(summary).toEqual({ refreshed: 0, failed: 0 })
    expect(zaloIntegrationService.findAllByWorkspaceIds).not.toHaveBeenCalled()
  })

  test("sums refreshed/failed across every provider for the combined workspace set", async () => {
    zaloIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "zalo-a",
        workspaceId: "ws-1",
        auth: { tokens: { refreshToken: "rt-a" } },
      },
    ])
    zaloIntegrationService.findById.mockResolvedValue({
      id: "zalo-a",
      workspaceId: "ws-1",
      auth: { tokens: { refreshToken: "rt-a" } },
    })
    tiktokIntegrationService.findAllByWorkspaceIds.mockResolvedValue([
      {
        id: "tiktok-b",
        workspaceId: "ws-2",
        auth: {
          clientId: "cid",
          clientSecret: "secret",
          tokens: { refreshToken: "rt-b" },
        },
      },
    ])
    tiktokIntegrationService.findById.mockResolvedValue({
      id: "tiktok-b",
      workspaceId: "ws-2",
      auth: {
        clientId: "cid",
        clientSecret: "secret",
        tokens: { refreshToken: "rt-b" },
      },
    })

    const summary = await channelTokenRefreshService.refreshWorkspaces({
      workspaceIds: ["ws-1", "ws-2"],
    })

    expect(summary).toEqual({ refreshed: 2, failed: 0 })
  })
})
