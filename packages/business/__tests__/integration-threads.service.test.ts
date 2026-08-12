import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connectChannelIntegration: vi.fn(),
  disconnectInbox: vi.fn(),
  deleteWhere: vi.fn(),
  deleteTable: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  updateSet: vi.fn(),
  updateReturning: vi.fn(),
  updateWhere: vi.fn(),
  updateTable: vi.fn(),
  findOrFail: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  workspaceFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationThreadsModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
    },
    select: mocks.select,
    update: mocks.updateTable,
    delete: mocks.deleteTable,
    transaction: mocks.transaction,
  },
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
  }),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationThreadsModel: {
    id: "IntegrationThreads.id",
    workspaceId: "IntegrationThreads.workspaceId",
    inboxId: "IntegrationThreads.inboxId",
    auth: "IntegrationThreads.auth",
  },
}))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mocks.connectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mocks.disconnectInbox },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { findById: mocks.workspaceFindById },
}))

const { integrationThreadsService } = await import(
  "../src/integration-threads/service"
)

describe("integrationThreadsService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectWhere.mockResolvedValue([])
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.updateReturning.mockResolvedValue([])
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateTable.mockReturnValue({ set: mocks.updateSet })
    mocks.deleteWhere.mockResolvedValue(undefined)
    mocks.deleteTable.mockReturnValue({ where: mocks.deleteWhere })
    mocks.transaction.mockImplementation(
      async (callback) =>
        await callback({
          query: {
            integrationThreadsModel: {
              findFirst: mocks.findFirst,
            },
          },
          delete: mocks.deleteTable,
        }),
    )
  })

  test("connect uses the threads channel and scopes inbox sourceId to the threads user id", async () => {
    mocks.connectChannelIntegration.mockResolvedValue({
      integration: { id: "threads-1" },
    })

    await integrationThreadsService.connect({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      auth: { token: "token" },
      threadsUserId: "user-1",
      username: "chatbotx",
      name: "ChatbotX",
    })

    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        inboxData: expect.objectContaining({
          workspaceId: "workspace-1",
          channel: "threads",
          sourceId: "user-1",
        }),
      }),
    )
  })

  test("reconnect updates only the targeted workspace row", async () => {
    await integrationThreadsService.reconnect({
      workspaceId: "workspace-1",
      id: "threads-1",
      auth: { token: "new-token" },
      username: "chatbotx-updated",
      name: "ChatbotX Updated",
    })

    expect(mocks.updateTable).toHaveBeenCalled()
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "workspace-1",
    )
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "threads-1",
    )
  })

  test("findByInboxId returns undefined when no Threads integration row exists", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      integrationThreadsService.findByInboxId("inbox-missing"),
    ).resolves.toBeUndefined()

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { inboxId: "inbox-missing" },
    })
  })

  test("listDueForTokenRefresh returns rows that are expiring soon or missing expiresAt", async () => {
    mocks.selectWhere.mockResolvedValue([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        auth: {
          tokens: {
            accessToken: "token-1",
            expiresAt: "2026-08-20T00:00:00.000Z",
          },
        },
      },
      {
        id: "threads-2",
        workspaceId: "workspace-2",
        auth: {
          tokens: {
            accessToken: "token-2",
          },
        },
      },
      {
        id: "threads-3",
        workspaceId: "workspace-3",
        auth: {
          tokens: {
            accessToken: "token-3",
            expiresAt: "2026-09-20T00:00:00.000Z",
          },
        },
      },
      {
        id: "threads-4",
        workspaceId: "workspace-4",
        auth: {
          tokens: {
            expiresAt: "2026-08-20T00:00:00.000Z",
          },
        },
      },
    ])

    const data = await integrationThreadsService.listDueForTokenRefresh({
      refreshBefore: new Date("2026-08-26T00:00:00.000Z"),
    })

    expect(data).toEqual([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        auth: {
          tokens: {
            accessToken: "token-1",
            expiresAt: "2026-08-20T00:00:00.000Z",
          },
        },
        currentAccessToken: "token-1",
      },
      {
        id: "threads-2",
        workspaceId: "workspace-2",
        auth: {
          tokens: {
            accessToken: "token-2",
          },
        },
        currentAccessToken: "token-2",
      },
    ])
  })

  test("updateAuthIfAccessTokenMatches reports whether the compare-and-set succeeded", async () => {
    mocks.updateReturning.mockResolvedValueOnce([{ id: "threads-1" }])

    await expect(
      integrationThreadsService.updateAuthIfAccessTokenMatches({
        id: "threads-1",
        workspaceId: "workspace-1",
        expectedCurrentAccessToken: "token-1",
        auth: { tokens: { accessToken: "token-2" } },
      }),
    ).resolves.toBe(true)

    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "token-1",
    )

    await expect(
      integrationThreadsService.updateAuthIfAccessTokenMatches({
        id: "threads-1",
        workspaceId: "workspace-1",
        expectedCurrentAccessToken: "stale-token",
        auth: { tokens: { accessToken: "token-3" } },
      }),
    ).resolves.toBe(false)
  })

  test("disconnect deletes the integration row and disconnects the inbox", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "threads-1",
      inboxId: "inbox-1",
    })
    mocks.workspaceFindById.mockResolvedValue({ ownerId: "owner-1" })

    await integrationThreadsService.disconnect({
      workspaceId: "workspace-1",
      id: "threads-1",
    })

    expect(mocks.deleteTable).toHaveBeenCalled()
    expect(mocks.disconnectInbox).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx: expect.anything(),
    })
  })
})
