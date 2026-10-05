// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const mockFindFirstIntegration = vi.fn(async () => ({ id: "integration-1" }))
  const mockTx = {
    query: { integrationZaloModel: { findFirst: mockFindFirstIntegration } },
  }
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockFindFirstIntegration,
    mockTx,
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockEnqueueChannelScan: vi.fn(async () => undefined),
    mockInvalidateCacheByTags: vi.fn(async () => undefined),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(mockTx),
    ),
    mockIsConnected: vi.fn(async () => false),
    mockInboxCreate: vi.fn(async () => ({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })),
    mockFindByProviderSourceId: vi.fn(async () => undefined),
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
    mockWithQuotaCompensation: vi.fn(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: { delete: mocks.mockDelete, transaction: mocks.mockTransaction },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(
    async (props: { client?: { query: typeof mocks.mockTx.query } }) =>
      await (
        props.client ?? mocks.mockTx
      ).query.integrationZaloModel.findFirst(),
  ),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { zalo: "zalo" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationZaloModel: { id: "id", oaId: "oaId" },
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "integrationId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.mockInvalidateCacheByTags,
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByProviderSourceId: mocks.mockFindByProviderSourceId,
  },
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { zalo: { duplicateConstraint: undefined } },
  upsertConnectionRow: mocks.mockUpsertConnectionRow,
  withQuotaCompensation: mocks.mockWithQuotaCompensation,
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: mocks.mockDisconnect },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: {
    isConnected: mocks.mockIsConnected,
    create: mocks.mockInboxCreate,
    disconnect: mocks.mockDisconnect,
  },
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueChannelScan: mocks.mockEnqueueChannelScan },
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it (and anything it transitively re-exports, like this
// exception factory) must happen after those mocks are registered.
const { channelDuplicatedException } = await import("../src/errors")

const { zaloIntegrationService } = await import(
  "../src/integration-zalo/service"
)

describe("zaloIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `clearAllMocks` clears calls but keeps implementations, so tests that
    // install a failing/slow stub below must not leak into their neighbours.
    mocks.mockInvalidateCacheByTags.mockResolvedValue(undefined)
    mocks.mockEnqueueChannelScan.mockResolvedValue(undefined)
    mocks.mockIsConnected.mockResolvedValue(false)
    mocks.mockFindByProviderSourceId.mockResolvedValue(undefined)
    mocks.mockFindFirstIntegration.mockResolvedValue({ id: "integration-1" })
    mocks.mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })
    mocks.mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mocks.mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mocks.mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(mocks.mockTx),
    )
  })

  test("connects a brand-new OA: upserts with no existing Connection row, invalidates the cache tag, and enqueues a tag scan", async () => {
    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: { authType: "custom", token: "x" } as never,
    })

    expect(mocks.mockFindByProviderSourceId).toHaveBeenCalledWith(
      { workspaceId: "ws-1", provider: "zalo", sourceId: "oa-1" },
      mocks.mockTx,
    )
    expect(mocks.mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "zalo",
        kind: "channel",
        descriptor: { sourceId: "oa-1", displayName: "My OA" },
        existing: undefined,
        ownerId: "owner-1",
        inboxId: "inbox-1",
      }),
    )
    expect(result).toEqual({ integrationId: "integration-1", wasCreated: true })

    expect(mocks.mockInvalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mocks.mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1#zalos",
    ])
    expect(mocks.mockEnqueueChannelScan).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channelType: "zalo",
      integrationId: "integration-1",
    })
  })

  // An `existing` Connection row (disconnected revival, or a plain re-run of
  // OAuth on an already-connected OA) means `upsertConnectionRow` revives it
  // in place instead of creating a brand-new channel — no tag-scan enqueue,
  // since the OA's tags were already imported the first time it connected.
  test("revives an existing Connection row and skips the tag scan", async () => {
    mocks.mockFindByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      inboxId: "inbox-1",
    })
    mocks.mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })

    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: { authType: "custom", token: "x" } as never,
    })

    expect(mocks.mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        existing: { id: "conn-1", inboxId: "inbox-1" },
      }),
    )
    expect(result).toEqual({
      integrationId: "integration-1",
      wasCreated: false,
    })
    expect(mocks.mockEnqueueChannelScan).not.toHaveBeenCalled()
  })

  // The cache invalidation is a Redis round-trip; if it is not awaited the
  // OAuth callback redirects before the tag is cleared and the channels page
  // renders a stale list that omits the OA just connected.
  test("awaits the cache invalidation before returning", async () => {
    // The stub stays pending until `release()` is called, so `connect` can only
    // settle if it actually awaits it. A fire-and-forget call would resolve the
    // promise below while the invalidation is still in flight.
    let invalidationSettled = false
    const invalidationGate = Promise.withResolvers<void>()
    const release = () => {
      invalidationSettled = true
      invalidationGate.resolve()
    }
    mocks.mockInvalidateCacheByTags.mockImplementation(
      () => invalidationGate.promise,
    )

    let connectResolved = false
    const connecting = zaloIntegrationService
      .connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        oaId: "oa-1",
        name: "My OA",
        auth: {} as never,
      })
      .then((result) => {
        connectResolved = true
        return result
      })

    // Let every already-resolved microtask drain; `connect` must still be
    // parked on the pending invalidation.
    const microtaskDrain = Promise.withResolvers<void>()
    setImmediate(microtaskDrain.resolve)
    await microtaskDrain.promise
    expect(connectResolved).toBe(false)

    release()
    await connecting

    expect(invalidationSettled).toBe(true)
  })

  // The row is already committed by this point, so a queue outage must not
  // fail the connect — the caller still has to write its audit record.
  test("survives a channel-scan enqueue failure", async () => {
    mocks.mockEnqueueChannelScan.mockRejectedValue(new Error("redis down"))

    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: {} as never,
    })

    expect(result).toEqual({
      integrationId: "integration-1",
      wasCreated: true,
    })
  })

  // A genuine cross-workspace collision is rejected before the transaction
  // even opens — `upsertConnectionRow`/`withQuotaCompensation` must never run.
  test("propagates channelDuplicatedException when another workspace already holds a connected OA", async () => {
    mocks.mockIsConnected.mockResolvedValue(true)

    await expect(
      zaloIntegrationService.connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        oaId: "oa-1",
        name: "My OA",
        auth: {} as never,
      }),
    ).rejects.toMatchObject({ code: "channelDuplicated" })

    expect(mocks.mockWithQuotaCompensation).not.toHaveBeenCalled()
    expect(mocks.mockUpsertConnectionRow).not.toHaveBeenCalled()
  })

  test("channelDuplicatedException matches the shared exception factory", () => {
    expect(channelDuplicatedException().code).toBe("channelDuplicated")
  })
})

describe("zaloIntegrationService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes tagChannel rows before the integration row and disconnects its inbox in the same transaction", async () => {
    const callOrder: string[] = []
    const tx = {
      delete: vi.fn((table: { integrationId?: string }) => {
        callOrder.push(
          table?.integrationId ? "delete-tagChannel" : "delete-integration",
        )
        return { where: vi.fn(async () => undefined) }
      }),
    }
    mocks.mockDisconnect.mockImplementation(() => {
      callOrder.push("inbox-disconnect")
      return Promise.resolve()
    })

    await zaloIntegrationService.disconnect({
      workspaceId: "ws-1",
      id: "integration-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(callOrder).toEqual([
      "delete-tagChannel",
      "delete-integration",
      "inbox-disconnect",
    ])
    expect(mocks.mockDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "ws-1",
      tx,
    })
  })
})
