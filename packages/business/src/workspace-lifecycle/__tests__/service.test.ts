import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbExecute,
  mockSelectDistinctLimit,
  mockTransaction,
  mockTxDelete,
  mockDeleteWhere,
  mockLiftDecompressionLimit,
  mockListWithIntegrationsByWorkspace,
  mockInboxDisconnect,
  mockSql,
} = vi.hoisted(() => {
  const sql = Object.assign(
    vi.fn(() => ({})),
    {
      raw: vi.fn((value: string) => value),
    },
  )

  const deleteWhere = vi.fn()
  const txDelete = vi.fn(() => ({ where: deleteWhere }))
  const selectDistinctLimit = vi.fn()

  return {
    mockDbExecute: vi.fn(),
    mockSelectDistinctLimit: selectDistinctLimit,
    mockTransaction: vi.fn((callback: (tx: unknown) => unknown) =>
      callback({ delete: txDelete }),
    ),
    mockTxDelete: txDelete,
    mockDeleteWhere: deleteWhere,
    mockLiftDecompressionLimit: vi.fn().mockResolvedValue(undefined),
    mockListWithIntegrationsByWorkspace: vi.fn(),
    mockInboxDisconnect: vi.fn().mockResolvedValue(undefined),
    mockSql: sql,
  }
})

const selectDistinctChain = {
  from: () => selectDistinctChain,
  where: () => selectDistinctChain,
  orderBy: () => selectDistinctChain,
  limit: mockSelectDistinctLimit,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: mockDbExecute,
    selectDistinct: () => selectDistinctChain,
    transaction: mockTransaction,
  },
  sql: mockSql,
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  liftDecompressionLimit: mockLiftDecompressionLimit,
}))

vi.mock("../../inbox/service", () => ({
  inboxService: {
    listWithIntegrationsByWorkspace: mockListWithIntegrationsByWorkspace,
    disconnect: mockInboxDisconnect,
  },
}))

const { workspaceLifecycleService } = await import("../service")

// `HEAVY_WORKSPACE_TABLES` holds 6 non-hypertable tables; Message/Attachment are
// drained separately by the hypertable pass and are not in the ctid loop.
const HEAVY_TABLE_COUNT = 6
const MAX_BATCHES_PER_TABLE = 2000

describe("workspaceLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInboxDisconnect.mockResolvedValue(undefined)
    // Default: no hypertable rows, so purgeWorkspaceHeavyData exercises only the
    // ctid loop unless a test opts in.
    mockSelectDistinctLimit.mockResolvedValue([])
    mockDeleteWhere.mockResolvedValue({ rowCount: 0 })
    mockLiftDecompressionLimit.mockResolvedValue(undefined)
  })

  test("purgeWorkspaceHeavyData drains each ctid table until a short batch", async () => {
    // First batch is full (keep draining), then a short batch stops that table.
    mockDbExecute
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValue({ rowCount: 1 })

    const result = await workspaceLifecycleService.purgeWorkspaceHeavyData({
      workspaceId: "workspace-1",
      batchSize: 2,
    })

    // Table 1: 2 + 1 rows (2 calls); tables 2..6: 1 row each (1 call).
    expect(result).toBe(2 + 1 + (HEAVY_TABLE_COUNT - 1))
    expect(mockDbExecute).toHaveBeenCalledTimes(2 + (HEAVY_TABLE_COUNT - 1))
  })

  test("purgeWorkspaceHeavyData caps batches per ctid table", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    mockDbExecute.mockResolvedValue({ rowCount: 1 })

    const result = await workspaceLifecycleService.purgeWorkspaceHeavyData({
      workspaceId: "workspace-1",
      batchSize: 1,
    })

    expect(result).toBe(HEAVY_TABLE_COUNT * MAX_BATCHES_PER_TABLE)
    expect(mockDbExecute).toHaveBeenCalledTimes(
      HEAVY_TABLE_COUNT * MAX_BATCHES_PER_TABLE,
    )
    vi.restoreAllMocks()
  })

  test("purgeWorkspaceHeavyData drains hypertable rows by conversation with the decompression limit lifted", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    // ctid loop deletes nothing (short first batch → immediate break per table).
    mockDbExecute.mockResolvedValue({ rowCount: 0 })
    // Message pass: one page of two conversations, then empty. Attachment pass:
    // empty.
    mockSelectDistinctLimit
      .mockResolvedValueOnce([
        { conversationId: "conv-1" },
        { conversationId: "conv-2" },
      ])
      .mockResolvedValue([])
    mockDeleteWhere.mockResolvedValue({ rowCount: 3 })

    const result = await workspaceLifecycleService.purgeWorkspaceHeavyData({
      workspaceId: "workspace-1",
      batchSize: 5000,
    })

    // One page → one transaction that lifts the cap once and deletes from both
    // Message and Attachment (rowCount 3 each = 6). ctid loop adds 0.
    expect(result).toBe(6)
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockLiftDecompressionLimit).toHaveBeenCalledOnce()
    expect(mockTxDelete).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  test("disconnectWorkspaceChannels disconnects provider auth and marks the inbox disconnected", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "messenger",
        integrationMessenger: {
          id: "integration-1",
          auth: { token: "secret" },
        },
      },
    ])

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: updateWhere })),
      })),
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
    }

    await expect(
      workspaceLifecycleService.disconnectWorkspaceChannels({
        integrations: {
          messenger: {
            disconnect,
            isRevokedTokenError: () => false,
          },
        },
        teardownLevel: "disconnect",
        tx: tx as never,
        workspaceId: "workspace-1",
        ownerId: "owner-1",
      }),
    ).resolves.toBe(1)

    expect(disconnect).toHaveBeenCalledWith({ token: "secret" })
    expect(tx.update).toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalled()
    expect(mockInboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx,
    })
  })

  test("disconnectWorkspaceChannels skips the provider disconnect when the auth row is already gone", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "messenger",
        // integrationMessenger is absent, so there is no auth to disconnect with.
      },
    ])

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }

    await workspaceLifecycleService.disconnectWorkspaceChannels({
      integrations: {
        messenger: {
          disconnect,
          isRevokedTokenError: () => false,
        },
      },
      teardownLevel: "disconnect",
      tx: tx as never,
      workspaceId: "workspace-1",
      ownerId: "owner-1",
    })

    // No credentials → provider call is skipped, but the inbox is still retired.
    expect(disconnect).not.toHaveBeenCalled()
    expect(mockInboxDisconnect).toHaveBeenCalled()
  })
})
