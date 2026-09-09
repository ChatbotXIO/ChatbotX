import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn(),
  auditChannelConnected: vi.fn().mockResolvedValue(undefined),
  connectChannelIntegration: vi.fn(),
  createId: vi.fn(() => "generated-id"),
  eq: vi.fn(),
  findConnectedPageIds: vi.fn(),
  findOrFail: vi.fn(),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  insert: vi.fn(),
  runConnectTransaction: vi.fn(),
  select: vi.fn(),
  sql: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: { select: mocks.select, transaction: mocks.transaction },
  eq: mocks.eq,
  findOrFail: mocks.findOrFail,
  inArray: mocks.inArray,
  sql: mocks.sql,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {
    findConnectedPageIds: mocks.findConnectedPageIds,
    insert: mocks.insert,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT: "IntegrationMessenger_pageId_key",
  integrationMessengerModel: {
    pageId: "pageId",
  },
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "integrationId",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger" } },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("../src/inbox/connect-channel", () => ({
  auditChannelConnected: mocks.auditChannelConnected,
  connectChannelIntegration: mocks.connectChannelIntegration,
  runConnectTransaction: mocks.runConnectTransaction,
}))

// Only `listCloneTargetsForUser` reads memberships; keep the import chain
// of this connect-page test as narrow as before.
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {},
}))

const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)

const tx = { tx: true }

function mockConnectChannelIntegration(wasCreated: boolean) {
  mocks.connectChannelIntegration.mockImplementation(
    async ({
      insertIntegration,
    }: {
      insertIntegration: (
        inboxId: string,
        wasCreated: boolean,
      ) => Promise<unknown>
    }) => {
      const integration = await insertIntegration("inbox-1", wasCreated)
      return { inbox: { id: "inbox-1" }, wasCreated, integration }
    },
  )
}

describe("messengerIntegrationService.connectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.insert.mockResolvedValue({
      id: "integration-1",
      workspaceId: "workspace-1",
      pageId: "page-1",
    })
    // Pass-through — the constraint→channelDuplicatedException mapping is
    // runConnectTransaction's own job, covered by connect-channel.test.ts.
    mocks.runConnectTransaction.mockImplementation(
      (_channel: string, body: (tx: unknown) => Promise<unknown>) =>
        mocks.transaction(body),
    )
  })

  test("inserts the repository row inside the transaction with the given workspaceId", async () => {
    mockConnectChannelIntegration(true)

    const result = await messengerIntegrationService.connectPage({
      actorUserId: "user-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      page: { pageId: "page-1", pageName: "My Page" },
      auth: { tokens: { accessToken: "token" } },
      persistentMenus: [],
    })

    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        ownerId: "owner-1",
        inboxData: expect.objectContaining({
          workspaceId: "workspace-1",
          channel: "messenger",
          sourceId: "page-1",
          name: "My Page",
        }),
      }),
    )
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        pageId: "page-1",
        name: "My Page",
      }),
      tx,
    )
    expect(result).toEqual({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      wasCreated: true,
      integration: {
        id: "integration-1",
        workspaceId: "workspace-1",
        pageId: "page-1",
      },
    })
  })

  test("dispatches a connect audit only when wasCreated is true", async () => {
    mockConnectChannelIntegration(true)

    await messengerIntegrationService.connectPage({
      actorUserId: "user-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      page: { pageId: "page-1", pageName: "My Page" },
      auth: {},
      persistentMenus: [],
    })

    expect(mocks.auditChannelConnected).toHaveBeenCalledWith({
      channel: "messenger",
      actorUserId: "user-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
    })
  })

  test("does not dispatch an audit when the row already existed (wasCreated: false)", async () => {
    mockConnectChannelIntegration(false)

    await messengerIntegrationService.connectPage({
      actorUserId: "user-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      page: { pageId: "page-1", pageName: "My Page" },
      auth: {},
      persistentMenus: [],
    })

    expect(mocks.auditChannelConnected).not.toHaveBeenCalled()
  })

  // The constraint→channelDuplicatedException mapping (and the audit
  // payload/log strings) are runConnectTransaction's / auditChannelConnected's
  // own contracts, exhaustively covered in connect-channel.test.ts — this
  // only guards that connectPage propagates whatever the transaction rejects
  // with, rather than swallowing it.
  test("a transaction rejection propagates", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("connection reset"))

    await expect(
      messengerIntegrationService.connectPage({
        actorUserId: "user-1",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
        page: { pageId: "page-1", pageName: "My Page" },
        auth: {},
        persistentMenus: [],
      }),
    ).rejects.toThrow("connection reset")
  })
})

describe("messengerIntegrationService.findConnectedPageIds", () => {
  test("delegates to the repository", async () => {
    mocks.findConnectedPageIds.mockResolvedValue(new Set(["page-1"]))

    await expect(
      messengerIntegrationService.findConnectedPageIds(["page-1", "page-2"]),
    ).resolves.toEqual(new Set(["page-1"]))
    expect(mocks.findConnectedPageIds).toHaveBeenCalledWith([
      "page-1",
      "page-2",
    ])
  })
})
