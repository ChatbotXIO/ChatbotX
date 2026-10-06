// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateInbox,
  mockDelete,
  mockDisconnect,
  mockFindByProviderSourceId,
  mockFindOrFail,
  mockQueryFindFirst,
  mockTransaction,
  mockUpsertConnectionRow,
  mockWithQuotaCompensation,
  mockWorkspaceCreate,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockQueryFindFirst = vi.fn(async () => ({ id: "integration-1" }))
  const makeTx = () => ({
    delete: mockDelete,
    query: { integrationTelegramModel: { findFirst: mockQueryFindFirst } },
  })

  return {
    mockCreateInbox: vi.fn(async () => ({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockFindByProviderSourceId: vi.fn(async () => undefined),
    mockFindOrFail: vi.fn(),
    mockQueryFindFirst,
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(makeTx()),
    ),
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
    mockWithQuotaCompensation: vi.fn(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    ),
    mockWorkspaceCreate: vi.fn(async () => ({ id: "ws-new" })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  integrationTypes: { enum: { telegram: "telegram" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTelegramModel: { id: "id", botId: "botId" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByProviderSourceId: mockFindByProviderSourceId },
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: {
    telegram: { duplicateConstraint: "IntegrationTelegram_botId_key" },
  },
  upsertConnectionRow: mockUpsertConnectionRow,
  withQuotaCompensation: mockWithQuotaCompensation,
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: mockDisconnect },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mockCreateInbox },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { create: mockWorkspaceCreate },
}))

// Dynamic: `vi.mock` above is hoisted above static imports, so the module
// under test must be imported afterward to pick up the mocked dependencies.
const { telegramIntegrationService } = await import(
  "../src/integration-telegram/service"
)

describe("telegramIntegrationService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateInbox.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })
    mockFindByProviderSourceId.mockResolvedValue(undefined)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mockQueryFindFirst.mockResolvedValue({ id: "integration-1" })
    mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          delete: mockDelete,
          query: {
            integrationTelegramModel: { findFirst: mockQueryFindFirst },
          },
        }),
    )
  })

  test("awaits onConnected inside the transaction (assert ordering)", async () => {
    const callOrder: string[] = []
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        callOrder.push("transaction-start")
        const result = await callback({
          delete: mockDelete,
          query: {
            integrationTelegramModel: { findFirst: mockQueryFindFirst },
          },
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
    mockCreateInbox.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })
    mockFindByProviderSourceId.mockResolvedValue(undefined)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mockQueryFindFirst.mockResolvedValue({ id: "integration-1" })
    mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          delete: mockDelete,
          query: {
            integrationTelegramModel: { findFirst: mockQueryFindFirst },
          },
        }),
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
    expect(mockWorkspaceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: "user-1" }),
    )
    expect(result.createdWorkspace).toBe(true)
    expect(result.workspaceId).toBe("ws-new")
  })

  test("looks up the existing Connection by botId so a same-workspace reconnect revives in place", async () => {
    mockFindByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      inboxId: "inbox-1",
    })
    mockCreateInbox.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: false,
    })

    const result = await telegramIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      createdBy: "user-1",
      botId: "bot-1",
      botUsername: "mybot",
      botToken: "token-1",
      onConnected: vi.fn(async () => undefined),
    })

    expect(mockFindByProviderSourceId).toHaveBeenCalledWith(
      { workspaceId: "ws-1", provider: "telegram", sourceId: "bot-1" },
      expect.anything(),
    )
    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        existing: { id: "conn-1", inboxId: "inbox-1" },
      }),
    )
    expect(result.wasCreated).toBe(false)
  })

  test("passes the bot's auth, descriptor and inbox through to upsertConnectionRow", async () => {
    await telegramIntegrationService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      createdBy: "user-1",
      botId: "bot-1",
      botUsername: "mybot",
      botToken: "token-1",
      onConnected: vi.fn(async () => undefined),
    })

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "telegram",
        kind: "channel",
        descriptor: { sourceId: "bot-1", displayName: "mybot" },
        auth: { authType: "secretText", secretText: "token-1" },
        existing: undefined,
        ownerId: "owner-1",
        inboxId: "inbox-1",
      }),
    )
  })
})

describe("telegramIntegrationService.disconnect", () => {
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
