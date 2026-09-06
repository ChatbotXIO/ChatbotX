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

const { zaloIntegrationService } = await import(
  "../src/integration-zalo/service"
)

describe("zaloIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  test("throws channelDuplicatedException when insertIntegration receives wasCreated === false", async () => {
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
      tx,
    })
  })
})
