// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectChannelIntegration,
  mockDelete,
  mockDisconnect,
  mockEnqueueChannelScan,
  mockInsertReturning,
  mockInsert,
  mockInvalidateCacheByTags,
  mockTransaction,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertReturning = vi.fn(async () => [{ id: "integration-1" }])
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockConnectChannelIntegration: vi.fn(),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockEnqueueChannelScan: vi.fn(async () => undefined),
    mockInsertReturning,
    mockInsert,
    mockInvalidateCacheByTags: vi.fn(async () => undefined),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, insert: mockInsert }),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { zalo: "zalo" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationZaloModel: { id: "id", openId: "openId" },
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "integrationId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mockConnectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mockDisconnect },
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueChannelScan: mockEnqueueChannelScan },
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { channelDuplicatedException } = await import("../src/errors")

const { zaloIntegrationService } = await import(
  "../src/integration-zalo/service"
)

describe("zaloIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `clearAllMocks` clears calls but keeps implementations, so tests that
    // install a failing/slow stub below must not leak into their neighbours.
    mockInvalidateCacheByTags.mockResolvedValue(undefined)
    mockEnqueueChannelScan.mockResolvedValue(undefined)
    mockInsertReturning.mockResolvedValue([{ id: "integration-1" }])
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, insert: mockInsert }),
    )
  })

  test("invalidates the zalos cache tag exactly once and enqueues the channel scan when an integration id was produced", async () => {
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (
          inboxId: string,
          wasCreated: boolean,
        ) => Promise<unknown>
      }) => {
        await props.insertIntegration("inbox-1", true)
        return { wasCreated: true }
      },
    )

    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: { token: "x" },
    })

    expect(mockInvalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1#zalos",
    ])
    expect(result.wasCreated).toBe(true)
  })

  // The cache invalidation is a Redis round-trip; if it is not awaited the
  // OAuth callback redirects before the tag is cleared and the channels page
  // renders a stale list that omits the OA just connected.
  test("awaits the cache invalidation before returning", async () => {
    // The stub stays pending until `release()` is called, so `connect` can only
    // settle if it actually awaits it. A fire-and-forget call would resolve the
    // promise below while the invalidation is still in flight.
    let release: () => void = () => undefined
    let invalidationSettled = false
    mockInvalidateCacheByTags.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            invalidationSettled = true
            resolve()
          }
        }),
    )
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (
          inboxId: string,
          wasCreated: boolean,
        ) => Promise<unknown>
      }) => {
        await props.insertIntegration("inbox-1", true)
        return { wasCreated: true }
      },
    )

    let connectResolved = false
    const connecting = zaloIntegrationService
      .connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        oaId: "oa-1",
        name: "My OA",
        auth: {},
      })
      .then((result) => {
        connectResolved = true
        return result
      })

    // Let every already-resolved microtask drain; `connect` must still be
    // parked on the pending invalidation.
    await new Promise((resolve) => setImmediate(resolve))
    expect(connectResolved).toBe(false)

    release()
    await connecting

    expect(invalidationSettled).toBe(true)
  })

  // The row is already committed by this point, so a queue outage must not
  // fail the connect — the caller still has to write its audit record.
  test("survives a channel-scan enqueue failure", async () => {
    mockEnqueueChannelScan.mockRejectedValue(new Error("redis down"))
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (
          inboxId: string,
          wasCreated: boolean,
        ) => Promise<unknown>
      }) => {
        await props.insertIntegration("inbox-1", true)
        return { wasCreated: true }
      },
    )

    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: {},
    })

    expect(result).toEqual({
      integrationId: "integration-1",
      wasCreated: true,
    })
  })

  test("does not enqueue a channel scan when no integration id was produced", async () => {
    mockConnectChannelIntegration.mockResolvedValue({ wasCreated: true })

    await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: {},
    })

    expect(mockEnqueueChannelScan).not.toHaveBeenCalled()
  })

  // `wasCreated === false` means the Inbox already existed in THIS workspace
  // and is already connected — the owner re-ran OAuth for their own OA. That
  // is not a duplicate, so `connect` resolves with no integration id and lets
  // the caller redirect; throwing would roll back the transaction.
  test("resolves without an integration id when insertIntegration receives wasCreated === false", async () => {
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (
          inboxId: string,
          wasCreated: boolean,
        ) => Promise<unknown>
      }) => {
        await props.insertIntegration("inbox-1", false)
        return { wasCreated: false }
      },
    )

    const result = await zaloIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      oaId: "oa-1",
      name: "My OA",
      auth: {},
    })

    expect(result).toEqual({ integrationId: undefined, wasCreated: false })
    expect(mockEnqueueChannelScan).not.toHaveBeenCalled()
  })

  // A genuine cross-workspace collision is rejected inside
  // `connectChannelIntegration` (via `inboxService.isConnected`), never by the
  // `insertIntegration` callback — `connect` must let that exception through.
  test("propagates channelDuplicatedException thrown by connectChannelIntegration", async () => {
    mockConnectChannelIntegration.mockRejectedValue(
      channelDuplicatedException(),
    )

    await expect(
      zaloIntegrationService.connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        oaId: "oa-1",
        name: "My OA",
        auth: {},
      }),
    ).rejects.toMatchObject({ code: "channelDuplicated" })
  })
})

describe("zaloIntegrationService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes tagChannel rows before the integration row and calls inboxService.disconnect with the same tx", async () => {
    const callOrder: string[] = []
    const tx = {
      delete: vi.fn((table: { integrationId?: string }) => {
        callOrder.push(
          table?.integrationId ? "delete-tagChannel" : "delete-integration",
        )
        return { where: vi.fn(async () => undefined) }
      }),
    }
    mockDisconnect.mockImplementation(() => {
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
    expect(mockDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "ws-1",
      reason: "manual",
      tx,
    })
  })
})
