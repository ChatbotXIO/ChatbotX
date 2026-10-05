import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
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
  findFirst: vi.fn(),
  findOrFail: vi.fn(async ({ where }: { where: { inboxId: string } }) => ({
    id: "threads-1",
    inboxId: where.inboxId,
  })),
  findMany: vi.fn(),
  transaction: vi.fn(),
  workspaceFindById: vi.fn(),
  findByInboxId: vi.fn(async () => undefined),
  findByProviderSourceId: vi.fn(async () => undefined),
  connectionUpdate: vi.fn(),
  markDegradedByIdentifier: vi.fn(),
  inboxCreate: vi.fn(async () => ({ inbox: { id: "inbox-1" } })),
  upsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
  withQuotaCompensation: vi.fn(
    async (_input: unknown, operation: () => Promise<unknown>) =>
      await operation(),
  ),
  saveOrInsertSatellite: vi.fn(),
  resolveOwnerId: vi.fn(async () => "owner-1"),
  authExpiresAtOf: vi.fn(() => undefined),
  connectionTransition: vi.fn(),
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
    threadsUserId: "IntegrationThreads.threadsUserId",
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByInboxId: mocks.findByInboxId,
    findByProviderSourceId: mocks.findByProviderSourceId,
    update: mocks.connectionUpdate,
  },
}))

// Stubs the whole `../connection` barrel so this suite never pulls in the
// real `store-bindings.ts` (which would need every schema model the Connection
// domain knows about, far beyond what this file exercises).
vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: {
    threads: { duplicateConstraint: "IntegrationThreads_threadsUserId_key" },
  },
  upsertConnectionRow: mocks.upsertConnectionRow,
  withQuotaCompensation: mocks.withQuotaCompensation,
  saveOrInsertSatellite: mocks.saveOrInsertSatellite,
  resolveOwnerId: mocks.resolveOwnerId,
  authExpiresAtOf: mocks.authExpiresAtOf,
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    disconnectInbox: mocks.disconnectInbox,
    markDegradedByIdentifier: mocks.markDegradedByIdentifier,
    transition: mocks.connectionTransition,
  },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mocks.inboxCreate },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { findById: mocks.workspaceFindById },
}))
// The vi.mock calls above are hoisted; the module under test must be
// imported afterward (dynamic import) to pick up the mocked dependencies
// instead of the real ones — same pattern as integration-telegram-service.test.ts.
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
    mocks.inboxCreate.mockResolvedValue({ inbox: { id: "inbox-1" } })
    mocks.upsertConnectionRow.mockResolvedValue({ id: "conn-1" })
    mocks.withQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
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

  test("connect creates the Inbox with skipQuota and writes through upsertConnectionRow", async () => {
    await integrationThreadsService.connect({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      auth: { token: "token" },
      threadsUserId: "user-1",
      username: "chatbotx",
      name: "ChatbotX",
    })

    expect(mocks.inboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          channel: "threads",
          sourceId: "user-1",
        }),
        skipQuota: true,
      }),
    )
    expect(mocks.upsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        provider: "threads",
        kind: "channel",
        descriptor: { sourceId: "user-1", displayName: "ChatbotX" },
        extraConfig: { username: "chatbotx" },
        inboxId: "inbox-1",
      }),
    )
  })

  test("connect looks up any existing Connection by provider+sourceId before writing (revive-in-place)", async () => {
    mocks.findByProviderSourceId.mockResolvedValueOnce({
      id: "conn-existing",
    })

    await integrationThreadsService.connect({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      auth: { token: "token" },
      threadsUserId: "user-1",
      username: "chatbotx",
      name: "ChatbotX",
    })

    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        provider: "threads",
        sourceId: "user-1",
      },
      expect.anything(),
    )
    expect(mocks.upsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({ existing: { id: "conn-existing" } }),
    )
  })

  test("connect wraps the write in withQuotaCompensation", async () => {
    await integrationThreadsService.connect({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      auth: { token: "token" },
      threadsUserId: "user-1",
      username: "chatbotx",
      name: "ChatbotX",
    })

    expect(mocks.withQuotaCompensation).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1" }),
      expect.any(Function),
    )
  })

  // `channel-registry`'s `getIntegrationFromContactInbox` branches on
  // `if (!integrationRow)` to raise its own typed `ChannelError`
  // (`integration_auth_missing`) for a Threads inbox whose satellite row is
  // gone (e.g. deleted on disconnect) — that branch only ever runs if this
  // resolves `undefined` instead of throwing. `findByInboxIdForWorkspace`
  // (the workspace-scoped variant) is the one allowed to throw.
  test("findByInboxId resolves undefined when no Threads integration row exists", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      integrationThreadsService.findByInboxId("inbox-missing"),
    ).resolves.toBeUndefined()

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { inboxId: "inbox-missing" },
    })
    expect(mocks.findOrFail).not.toHaveBeenCalled()
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
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        },
      },
      {
        id: "threads-2",
        workspaceId: "workspace-1",
        auth: { tokens: {} },
      },
      {
        id: "threads-3",
        workspaceId: "workspace-1",
        auth: "not-an-object",
      },
      {
        id: "threads-4",
        workspaceId: "workspace-1",
        auth: {
          tokens: {
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        },
      },
    ])

    await expect(
      integrationThreadsService.listDueForTokenRefresh(),
    ).resolves.toEqual([
      {
        id: "threads-1",
        workspaceId: "workspace-1",
        auth: {
          tokens: {
            accessToken: "token-1",
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        },
        currentAccessToken: "token-1",
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

  test("reconnect falls back to the legacy direct update when the row has no Connection yet", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "threads-1",
      inboxId: "inbox-1",
      threadsUserId: "user-1",
    })
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

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ tokenRefreshError: null }),
    )
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "workspace-1",
    )
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "threads-1",
    )
    expect(mocks.saveOrInsertSatellite).not.toHaveBeenCalled()
  })

  test("reconnect returns false when no Threads integration row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

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

  test("reconnect returns false when the legacy update matches no row", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "threads-1",
      inboxId: "inbox-1",
      threadsUserId: "user-1",
    })
    mocks.updateReturning.mockResolvedValueOnce([])

    await expect(
      integrationThreadsService.reconnect({
        workspaceId: "workspace-1",
        id: "threads-1",
        auth: { tokens: { accessToken: "token-2" } },
        username: "chatbotx",
        name: "ChatbotX",
      }),
    ).resolves.toBe(false)
  })

  test("reconnect goes through the Connection engine (saveOrInsertSatellite + transition) once a Connection row exists", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "threads-1",
      inboxId: "inbox-1",
      threadsUserId: "user-1",
    })
    mocks.findByInboxId.mockResolvedValueOnce({
      id: "conn-1",
      inboxId: "inbox-1",
      workspaceId: "workspace-1",
    })

    await expect(
      integrationThreadsService.reconnect({
        workspaceId: "workspace-1",
        id: "threads-1",
        auth: { tokens: { accessToken: "token-2" } },
        username: "chatbotx",
        name: "ChatbotX Updated",
      }),
    ).resolves.toBe(true)

    expect(mocks.saveOrInsertSatellite).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        descriptor: { sourceId: "user-1", displayName: "ChatbotX Updated" },
        extraConfig: {
          username: "chatbotx",
          name: "ChatbotX Updated",
          tokenRefreshError: null,
        },
      }),
    )
    expect(mocks.connectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn-1", workspaceId: "workspace-1" }),
      expect.anything(),
    )
    expect(mocks.connectionTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        event: "connect.completed",
      }),
    )
    // Not the legacy direct-update path.
    expect(mocks.updateTable).not.toHaveBeenCalled()
  })

  test("a successful refresh clears tokenRefreshError", async () => {
    await integrationThreadsService.updateAuthIfAccessTokenMatches({
      id: "threads-1",
      workspaceId: "workspace-1",
      expectedCurrentAccessToken: "token-1",
      auth: { tokens: { accessToken: "token-2" } },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ tokenRefreshError: null }),
    )
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

    mocks.updateReturning.mockResolvedValueOnce([])
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

  test("markTokenRefreshError degrades the Connection row when the update matches", async () => {
    mocks.updateReturning.mockResolvedValue([
      { workspaceId: "workspace-1", threadsUserId: "threads-user-1" },
    ])

    await integrationThreadsService.markTokenRefreshError("threads-1", "boom")

    expect(mocks.markDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "threads",
      identifier: "threads-user-1",
      workspaceId: "workspace-1",
      reason: "refresh_failed",
    })
  })

  test("markTokenRefreshError skips the degrade call when the update matches no row", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await integrationThreadsService.markTokenRefreshError(
      "threads-missing",
      "boom",
    )

    expect(mocks.markDegradedByIdentifier).not.toHaveBeenCalled()
  })
})
