// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateInbox,
  mockDelete,
  mockDisconnect,
  mockFindByProviderSourceId,
  mockFindOrFail,
  mockIsConnected,
  mockMarkDegradedByIdentifier,
  mockMarkUnhealthyByIdentifier,
  mockRecordRefreshedAuth,
  mockTransaction,
  mockUpdateReturning,
  mockUpsertConnectionRow,
  mockWithQuotaCompensation,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockUpdateReturning = vi.fn(async () => [
    { openId: "open-1", workspaceId: "ws-1" },
  ])

  return {
    mockCreateInbox: vi.fn(async () => ({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockFindByProviderSourceId: vi.fn(async () => undefined),
    mockFindOrFail: vi.fn(async () => ({ id: "integration-1" })),
    mockIsConnected: vi.fn(async () => false),
    mockMarkDegradedByIdentifier: vi.fn(async () => null),
    mockMarkUnhealthyByIdentifier: vi.fn(async () => null),
    mockRecordRefreshedAuth: vi.fn(async () => undefined),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    ),
    mockUpdateReturning,
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
    mockWithQuotaCompensation: vi.fn(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: mockUpdateReturning })),
      })),
    })),
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mockFindOrFail,
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTiktokModel: {
    id: "id",
    openId: "openId",
    workspaceId: "workspaceId",
  },
}))

// Partial: the service now pulls in `@chatbotx.io/integration-tiktok` for
// `getPostDetails`, and that graph reads other helpers (`zodBigintAsString`)
// from this module. Only `createId` needs to be deterministic here.
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "integration-1",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByProviderSourceId: mockFindByProviderSourceId,
    // Defaults to "no Connection row" so the existing disconnect test below
    // (written before the Connection-row integration) keeps exercising the
    // legacy `inboxService.disconnect` fallback unchanged.
    findByInboxId: vi.fn(async () => undefined),
  },
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: {
    tiktok: { duplicateConstraint: "IntegrationTiktok_openId_key" },
  },
  recordRefreshedAuth: mockRecordRefreshedAuth,
  upsertConnectionRow: mockUpsertConnectionRow,
  withQuotaCompensation: mockWithQuotaCompensation,
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    disconnectInbox: mockDisconnect,
    markDegradedByIdentifier: mockMarkDegradedByIdentifier,
    markUnhealthyByIdentifier: mockMarkUnhealthyByIdentifier,
  },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: {
    create: mockCreateInbox,
    disconnect: mockDisconnect,
    isConnected: mockIsConnected,
  },
}))

const { tiktokIntegrationService } = await import(
  "../src/integration-tiktok/service"
)

describe("tiktokIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateInbox.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })
    mockIsConnected.mockResolvedValue(false)
    mockFindByProviderSourceId.mockResolvedValue(undefined)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mockFindOrFail.mockResolvedValue({ id: "integration-1" })
    mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback({}),
    )
  })

  test("looks up the existing Connection by openId, upserts through the engine and returns the persisted row", async () => {
    const result = await tiktokIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      openId: "open-1",
      username: "user1",
      displayName: "User One",
      auth: { token: "x" },
    })

    expect(mockIsConnected).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "tiktok",
        sourceId: "user1",
        workspaceId: "ws-1",
      }),
    )
    expect(mockCreateInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        data: expect.objectContaining({
          workspaceId: "ws-1",
          name: "User One",
          channel: "tiktok",
          sourceId: "user1",
        }),
        skipQuota: true,
      }),
    )
    expect(mockFindByProviderSourceId).toHaveBeenCalledWith(
      { workspaceId: "ws-1", provider: "tiktok", sourceId: "open-1" },
      expect.anything(),
    )
    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "tiktok",
        kind: "channel",
        descriptor: { sourceId: "open-1", displayName: "User One" },
        auth: { token: "x" },
        existing: undefined,
        ownerId: "owner-1",
        inboxId: "inbox-1",
      }),
    )
    expect(result.integration).toEqual({ id: "integration-1" })
    expect(result.wasCreated).toBe(true)
  })

  test("passes the existing Connection row through so a same-workspace reconnect revives in place", async () => {
    mockFindByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      inboxId: "inbox-1",
    })
    mockCreateInbox.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: false,
    })

    const result = await tiktokIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      openId: "open-1",
      username: "user1",
      displayName: "User One",
      auth: { token: "x" },
    })

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        existing: { id: "conn-1", inboxId: "inbox-1" },
      }),
    )
    expect(result.wasCreated).toBe(false)
  })

  test("throws channelDuplicated and never reaches the engine when another workspace already owns this username", async () => {
    mockIsConnected.mockResolvedValue(true)

    await expect(
      tiktokIntegrationService.connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        openId: "open-1",
        username: "user1",
        displayName: "User One",
        auth: { token: "x" },
      }),
    ).rejects.toMatchObject({ code: "channelDuplicated" })

    expect(mockCreateInbox).not.toHaveBeenCalled()
    expect(mockUpsertConnectionRow).not.toHaveBeenCalled()
  })
})

describe("tiktokIntegrationService.updateAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ openId: "open-1" }])
  })

  test("calls recordRefreshedAuth with the satellite's workspace/provider/sourceId after a successful refresh", async () => {
    await tiktokIntegrationService.updateAuth({
      id: "integration-1",
      workspaceId: "ws-1",
      auth: { token: "x" },
    })

    expect(mockRecordRefreshedAuth).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "tiktok",
      sourceId: "open-1",
      auth: { token: "x" },
    })
  })

  test("rejects with notFoundException when the update matches zero rows", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await expect(
      tiktokIntegrationService.updateAuth({
        id: "integration-1",
        workspaceId: "ws-1",
        auth: { token: "x" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mockRecordRefreshedAuth).not.toHaveBeenCalled()
  })
})

describe("tiktokIntegrationService.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ openId: "open-1" }])
  })

  test("scopes the update by workspaceId and degrades the Connection by openId on a transient failure", async () => {
    await tiktokIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "tiktok",
      identifier: "open-1",
      reason: "refresh_failed",
      workspaceId: "ws-1",
    })
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })

  test("marks the Connection unhealthy when the provider confirms the token was revoked", async () => {
    await tiktokIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })

    expect(mockMarkUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "tiktok",
      identifier: "open-1",
      workspaceId: "ws-1",
      reason: "token_revoked",
    })
    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
  })

  test("no-ops the engine notification when the satellite row no longer exists", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await tiktokIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })
})

describe("tiktokIntegrationService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes the integration row before disconnecting its inbox", async () => {
    const callOrder: string[] = []
    const tx = {
      delete: vi.fn(() => {
        callOrder.push("delete")
        return { where: vi.fn(async () => undefined) }
      }),
    }
    mockDisconnect.mockImplementation(() => {
      callOrder.push("inbox-disconnect")
      return Promise.resolve()
    })

    await tiktokIntegrationService.disconnect({
      workspaceId: "ws-1",
      id: "integration-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(callOrder).toEqual(["delete", "inbox-disconnect"])
    expect(mockDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "ws-1",
      tx,
    })
  })
})
