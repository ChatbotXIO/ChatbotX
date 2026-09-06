// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectChannelIntegration,
  mockDelete,
  mockDisconnect,
  mockInsert,
  mockInsertReturning,
  mockOnConflictDoUpdate,
  mockTransaction,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertReturning = vi.fn(async () => [{ id: "integration-1" }])
  const mockOnConflictDoUpdate = vi.fn(() => ({
    returning: mockInsertReturning,
  }))
  const mockInsertValues = vi.fn(() => ({
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockConnectChannelIntegration: vi.fn(),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockInsert,
    mockInsertReturning,
    mockOnConflictDoUpdate,
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, insert: mockInsert }),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTiktokModel: { id: "id", openId: "openId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "integration-1",
}))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mockConnectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mockDisconnect },
}))

const { tiktokIntegrationService } = await import(
  "../src/integration-tiktok/service"
)

describe("tiktokIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertReturning.mockResolvedValue([{ id: "integration-1" }])
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, insert: mockInsert }),
    )
  })

  test("upserts on openId and returns the persisted id from returning", async () => {
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (inboxId: string) => Promise<unknown>
      }) => {
        const integration = await props.insertIntegration("inbox-1")
        return { wasCreated: true, integration }
      },
    )

    const result = await tiktokIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      openId: "open-1",
      username: "user1",
      displayName: "User One",
      auth: { token: "x" },
    })

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["openId"],
        set: expect.objectContaining({
          auth: { token: "x" },
          name: "User One",
          tokenRefreshError: null,
        }),
      }),
    )
    expect(result.integration).toEqual({ id: "integration-1" })
    expect(result.wasCreated).toBe(true)
  })
})

describe("tiktokIntegrationService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes the integration row then calls inboxService.disconnect", async () => {
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
