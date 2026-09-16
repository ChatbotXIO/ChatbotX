import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connectChannelIntegration: vi.fn(),
  runConnectTransaction: vi.fn(),
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
  insertTable: vi.fn(),
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
  runConnectTransaction: mocks.runConnectTransaction,
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
    mocks.runConnectTransaction.mockImplementation(
      async (_channel, body) => await body({ insert: mocks.insertTable }),
    )
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

  // `IntegrationThreads.threadsUserId` is unique globally while
  // `connectChannelIntegration`'s duplicate check is workspace-scoped, so the
  // insert is the only thing standing between a second workspace and an
  // orphaned `Inbox` row. Both writes must share one transaction.
  test("connect runs inside the threads connect transaction", async () => {
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

    expect(mocks.runConnectTransaction).toHaveBeenCalledWith(
      "threads",
      expect.any(Function),
    )
    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ tx: { insert: mocks.insertTable } }),
    )
  })

  test("connect joins a caller-provided transaction instead of opening its own", async () => {
    mocks.connectChannelIntegration.mockResolvedValue({
      integration: { id: "threads-1" },
    })
    const callerTx = { insert: vi.fn() }

    await integrationThreadsService.connect({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      auth: { token: "token" },
      threadsUserId: "user-1",
      username: "chatbotx",
      name: "ChatbotX",
      tx: callerTx as never,
    })

    expect(mocks.runConnectTransaction).not.toHaveBeenCalled()
    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ tx: callerTx }),
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

  // The expiry window is filtered in SQL, so the rows below are what Postgres
  // already narrowed to; the zod pass is only the safety net for an `auth`
  // blob whose shape the query cannot vouch for (`threads-4`, no accessToken).
  test("listDueForTokenRefresh drops rows whose auth blob is unusable", async () => {
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

  test("listDueForTokenRefresh filters the expiry window in SQL, not in JS", async () => {
    await integrationThreadsService.listDueForTokenRefresh({
      refreshBefore: new Date("2026-08-26T00:00:00.000Z"),
    })

    const where = JSON.stringify(mocks.selectWhere.mock.calls[0]?.[0])
    expect(where).toContain("expiresAt")
    expect(where).toContain("2026-08-26T00:00:00.000Z")

    // The JSON extraction MUST stay parenthesised. `::` binds tighter than
    // `->>` in Postgres, so an unwrapped `auth -> 'tokens' ->> 'expiresAt'`
    // followed by `::timestamptz` parses as `->> ('expiresAt'::timestamptz)`
    // and the whole refresh cron dies with "invalid input syntax for type
    // timestamp with time zone". Every other test here mocks the driver, so
    // this string is the only thing standing between that and production.
    expect(where).toContain("->> 'expiresAt')")
    expect(where).not.toContain("'expiresAt'::timestamptz")
  })

  test("listDueForTokenRefresh excludes rows missing expiresAt when asked to", async () => {
    await integrationThreadsService.listDueForTokenRefresh({
      refreshBefore: new Date("2026-08-26T00:00:00.000Z"),
      includeMissingExpiresAt: false,
    })

    const where = JSON.stringify(mocks.selectWhere.mock.calls[0]?.[0])
    expect(where).toContain("false")
  })

  // Without this the error icon and the workspace banner stick forever: only
  // `markTokenRefreshError` ever writes the column, so nothing else would
  // clear it after the token starts working again.
  test("a successful refresh and a reconnect both clear tokenRefreshError", async () => {
    await integrationThreadsService.updateAuthIfAccessTokenMatches({
      id: "threads-1",
      workspaceId: "workspace-1",
      expectedCurrentAccessToken: "token-1",
      auth: { tokens: { accessToken: "token-2" } },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ tokenRefreshError: null }),
    )

    mocks.updateSet.mockClear()
    await integrationThreadsService.reconnect({
      workspaceId: "workspace-1",
      id: "threads-1",
      auth: { tokens: { accessToken: "token-3" } },
      username: "chatbotx",
      name: "ChatbotX",
    })
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ tokenRefreshError: null }),
    )
  })

  test("reconnect reports whether a row actually matched", async () => {
    mocks.updateReturning.mockResolvedValueOnce([{ id: "threads-1" }])
    await expect(
      integrationThreadsService.reconnect({
        workspaceId: "workspace-1",
        id: "threads-1",
        auth: { tokens: { accessToken: "token-2" } },
        username: "chatbotx",
        name: "ChatbotX",
      }),
    ).resolves.toBe(true)

    mocks.updateReturning.mockResolvedValueOnce([])
    await expect(
      integrationThreadsService.reconnect({
        workspaceId: "workspace-1",
        id: "threads-missing",
        auth: { tokens: { accessToken: "token-2" } },
        username: "chatbotx",
        name: "ChatbotX",
      }),
    ).resolves.toBe(false)
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
      reason: "manual",
      tx: expect.anything(),
    })
  })
})
