import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// deleteMessengerIntegrationWithCleanup — the transactional cleanup body
// extracted from disconnect-messenger.ts: teardown -> tagChannel delete ->
// capi delete -> integration delete -> inbox disconnect, in order, all under
// the same tx.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tearDownForIntegration: vi.fn(),
  deleteByIntegration: vi.fn(),
  deleteById: vi.fn(),
  disconnect: vi.fn(),
  del: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: { transaction: mocks.transaction },
  eq: mocks.eq,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: { deleteById: mocks.deleteById },
  metaCapiEventRepository: { deleteByIntegration: mocks.deleteByIntegration },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "integrationId",
  },
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: { tearDownForIntegration: mocks.tearDownForIntegration },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mocks.disconnect },
}))

const { deleteMessengerIntegrationWithCleanup } = await import(
  "../src/integration-messenger/disconnect"
)

const tx = { tx: true }

describe("deleteMessengerIntegrationWithCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.del.mockReturnValue({
      where: vi.fn(() => Promise.resolve(undefined)),
    })
  })

  test("runs teardown, tagChannel delete, capi delete, integration delete, then inbox disconnect in order under the same tx", async () => {
    const callOrder: string[] = []
    mocks.tearDownForIntegration.mockImplementation(() => {
      callOrder.push("tearDown")
      return Promise.resolve(undefined)
    })
    mocks.deleteByIntegration.mockImplementation(() => {
      callOrder.push("capiDelete")
      return Promise.resolve(undefined)
    })
    mocks.deleteById.mockImplementation(() => {
      callOrder.push("integrationDelete")
      return Promise.resolve(undefined)
    })
    mocks.disconnect.mockImplementation(() => {
      callOrder.push("inboxDisconnect")
      return Promise.resolve(undefined)
    })

    const deleteBuilder = {
      where: vi.fn(() => {
        callOrder.push("tagChannelDelete")
        return Promise.resolve(undefined)
      }),
    }
    const txWithDelete = { ...tx, delete: vi.fn(() => deleteBuilder) }
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(txWithDelete),
    )

    await deleteMessengerIntegrationWithCleanup({
      workspaceId: "ws_1",
      id: "im_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
    })

    expect(callOrder).toEqual([
      "tearDown",
      "tagChannelDelete",
      "capiDelete",
      "integrationDelete",
      "inboxDisconnect",
    ])

    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      integrationId: "im_1",
      channel: "messenger",
      currentError: "Integration disconnected",
      tx: txWithDelete,
    })
    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      { workspaceId: "ws_1", channel: "messenger", integrationId: "im_1" },
      txWithDelete,
    )
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "im_1" }, txWithDelete)
    expect(mocks.disconnect).toHaveBeenCalledWith({
      inboxId: "inbox_1",
      ownerId: "owner_1",
      workspaceId: "ws_1",
      tx: txWithDelete,
    })
  })

  test("uses the caller-supplied tx instead of opening its own transaction", async () => {
    mocks.tearDownForIntegration.mockResolvedValue(undefined)
    mocks.deleteByIntegration.mockResolvedValue(undefined)
    mocks.deleteById.mockResolvedValue(undefined)
    mocks.disconnect.mockResolvedValue(undefined)

    const callerTx = {
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
    }

    await deleteMessengerIntegrationWithCleanup({
      workspaceId: "ws_1",
      id: "im_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
      tx: callerTx as never,
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ tx: callerTx }),
    )
  })
})
