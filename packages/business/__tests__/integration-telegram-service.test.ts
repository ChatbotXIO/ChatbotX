// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectChannelIntegration,
  mockDelete,
  mockDisconnect,
  mockInsert,
  mockTransaction,
  mockWorkspaceCreate,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertValues = vi.fn(async () => undefined)
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockConnectChannelIntegration: vi.fn(),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockInsert,
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, insert: mockInsert }),
    ),
    mockWorkspaceCreate: vi.fn(async () => ({ id: "ws-new" })),
  }
})

class DatabaseErrorStub extends Error {
  cause: { code: string }
  constructor(code: string) {
    super("db error")
    this.cause = { code }
  }
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  isDatabaseError: (error: unknown) => error instanceof DatabaseErrorStub,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  integrationTypes: { enum: { telegram: "telegram" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTelegramModel: { id: "id", botId: "botId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
}))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mockConnectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mockDisconnect },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { create: mockWorkspaceCreate },
}))

const { telegramIntegrationService } = await import(
  "../src/integration-telegram/service"
)

describe("telegramIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectChannelIntegration.mockResolvedValue({ wasCreated: true })
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, insert: mockInsert }),
    )
  })

  test("awaits onConnected inside the transaction (assert ordering)", async () => {
    const callOrder: string[] = []
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        callOrder.push("transaction-start")
        const result = await callback({
          delete: mockDelete,
          insert: mockInsert,
        })
        callOrder.push("transaction-end")
        return result
      },
    )
    const onConnected = vi.fn(() => {
      callOrder.push("onConnected")
      return Promise.resolve()
    })

    await telegramIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      createdBy: "user-1",
      botId: "bot-1",
      botUsername: "mybot",
      botToken: "token-1",
      onConnected,
    })

    expect(callOrder).toEqual([
      "transaction-start",
      "onConnected",
      "transaction-end",
    ])
    expect(onConnected).toHaveBeenCalledTimes(1)
  })

  test("creates a workspace only when workspaceId is absent", async () => {
    await telegramIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      createdBy: "user-1",
      botId: "bot-1",
      botUsername: "mybot",
      botToken: "token-1",
      onConnected: vi.fn(async () => undefined),
    })
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mockConnectChannelIntegration.mockResolvedValue({ wasCreated: true })
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, insert: mockInsert }),
    )

    const result = await telegramIntegrationService.connect({
      ownerId: "owner-1",
      createdBy: "user-1",
      botId: "bot-1",
      botUsername: "mybot",
      botToken: "token-1",
      onConnected: vi.fn(async () => undefined),
    })
    expect(mockWorkspaceCreate).toHaveBeenCalledTimes(1)
    expect(result.createdWorkspace).toBe(true)
    expect(result.workspaceId).toBe("ws-new")
  })

  test("a 23505 database error surfaces as ChatbotXException('Bot already connected')", async () => {
    mockTransaction.mockImplementation(() => {
      throw new DatabaseErrorStub("23505")
    })

    await expect(
      telegramIntegrationService.connect({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        createdBy: "user-1",
        botId: "bot-1",
        botUsername: "mybot",
        botToken: "token-1",
        onConnected: vi.fn(async () => undefined),
      }),
    ).rejects.toMatchObject({ message: "Bot already connected" })
  })
})

describe("telegramIntegrationService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes then calls inboxService.disconnect", async () => {
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

    await telegramIntegrationService.disconnect({
      workspaceId: "ws-1",
      id: "integration-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(callOrder).toEqual(["delete", "inbox-disconnect"])
  })
})
