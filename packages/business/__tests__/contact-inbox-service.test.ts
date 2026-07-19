import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbExecute,
  mockDbFindFirst,
  mockDbFindMany,
  mockDbReturning,
  mockDbSelect,
  mockDbSelectJoinLimit,
  mockDbSelectLimit,
  mockDbSet,
  mockDbUpdate,
  mockLoggerWarn,
} = vi.hoisted(() => {
  const mockDbSet = vi.fn()
  const mockDbWhere = vi.fn()
  const mockDbReturning = vi.fn()
  const mockLoggerWarn = vi.fn()
  const updateChain = {
    returning: mockDbReturning,
    set: mockDbSet,
    where: mockDbWhere,
  }
  mockDbSet.mockReturnValue(updateChain)
  mockDbWhere.mockReturnValue(updateChain)
  mockDbReturning.mockResolvedValue([{ id: "contact-inbox-1" }])

  const mockDbSelectLimit = vi.fn().mockResolvedValue([])
  const mockDbSelectJoinLimit = vi.fn().mockResolvedValue([])
  const mockDbSelectJoinWhere = vi.fn(() => ({ limit: mockDbSelectJoinLimit }))
  const mockDbSelectInnerJoin = vi.fn(() => ({ where: mockDbSelectJoinWhere }))
  const mockDbSelectOrderBy = vi.fn(() => ({ limit: mockDbSelectLimit }))
  const mockDbSelectWhere = vi.fn(() => ({ orderBy: mockDbSelectOrderBy }))
  const mockDbSelectFrom = vi.fn(() => ({
    innerJoin: mockDbSelectInnerJoin,
    where: mockDbSelectWhere,
  }))
  const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }))

  return {
    mockDbExecute: vi.fn().mockResolvedValue(undefined),
    mockDbFindFirst: vi.fn(),
    mockDbFindMany: vi.fn(),
    mockDbReturning,
    mockDbSelect,
    mockDbSelectJoinLimit,
    mockDbSelectLimit,
    mockDbSet,
    mockDbUpdate: vi.fn().mockReturnValue(updateChain),
    mockDbWhere,
    mockLoggerWarn,
  }
})

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
  {
    join: vi.fn((chunks: unknown[]) => ({ chunks })),
  },
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
    update: mockDbUpdate,
    query: {
      contactInboxModel: {
        findFirst: mockDbFindFirst,
        findMany: mockDbFindMany,
      },
    },
  },
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  gt: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  sql: mockSql,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {
    id: "contactId",
    workspaceId: "workspaceId",
  },
  contactInboxModel: {
    contactId: "contactId",
    firstInteractionAt: "firstInteractionAt",
    id: "id",
    inboxId: "inboxId",
    lastIncomingMessageAt: "lastIncomingMessageAt",
    lastMessageAt: "lastMessageAt",
    lastUserInput: "lastUserInput",
    lastUserInputType: "lastUserInputType",
    referral: "referral",
    sourceId: "sourceId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("../src/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}))

const { contactInboxService } = await import("../src/contact-inbox/service")

describe("contactInboxService timestamp helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbReturning.mockResolvedValue([{ id: "contact-inbox-1" }])
  })

  test("findLatestLastIncomingMessageAtByContactId returns the newest non-null timestamp", async () => {
    const latest = new Date("2026-01-03T00:00:00Z")
    mockDbFindMany.mockResolvedValue([{ lastIncomingMessageAt: latest }])

    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBe(latest)
    expect(mockDbFindMany).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        lastIncomingMessageAt: { isNotNull: true },
      },
      columns: { lastIncomingMessageAt: true },
      orderBy: { lastIncomingMessageAt: "desc" },
      limit: 1,
    })
  })

  test("findLatestLastIncomingMessageAtByContactId returns null when no timestamp exists", async () => {
    mockDbFindMany.mockResolvedValue([
      { lastIncomingMessageAt: null },
      { lastIncomingMessageAt: null },
    ])

    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBeNull()

    mockDbFindMany.mockResolvedValue([])
    await expect(
      contactInboxService.findLatestLastIncomingMessageAtByContactId({
        contactId: "contact-1",
      }),
    ).resolves.toBeNull()
  })

  test("findLatestLastIncomingMessageAtByContactId uses tx when provided", async () => {
    const txFindMany = vi
      .fn()
      .mockResolvedValue([{ lastIncomingMessageAt: new Date("2026-01-04") }])
    const tx = {
      query: {
        contactInboxModel: {
          findMany: txFindMany,
        },
      },
    }

    await contactInboxService.findLatestLastIncomingMessageAtByContactId({
      tx: tx as never,
      contactId: "contact-1",
    })

    expect(txFindMany).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        lastIncomingMessageAt: { isNotNull: true },
      },
      columns: { lastIncomingMessageAt: true },
      orderBy: { lastIncomingMessageAt: "desc" },
      limit: 1,
    })
    expect(mockDbFindMany).not.toHaveBeenCalled()
  })

  test("hasIncomingMessageSince returns true when an inbox has a newer incoming message in the workspace", async () => {
    mockDbSelectJoinLimit.mockResolvedValueOnce([{ id: "contact-inbox-1" }])
    const since = new Date("2026-07-16T00:00:00.000Z")

    await expect(
      contactInboxService.hasIncomingMessageSince({
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        since,
      }),
    ).resolves.toBe(true)

    expect(mockDbSelect).toHaveBeenCalledWith({ id: "id" })
    expect(mockDbSelectJoinLimit).toHaveBeenCalledWith(1)
  })

  test("hasIncomingMessageSince returns false when no matching newer incoming message exists", async () => {
    mockDbSelectJoinLimit.mockResolvedValueOnce([])

    await expect(
      contactInboxService.hasIncomingMessageSince({
        workspaceId: "workspace-2",
        contactInboxId: "contact-inbox-1",
        since: new Date("2026-07-16T00:00:00.000Z"),
      }),
    ).resolves.toBe(false)
  })

  test("findLatestBySource queries by inboxId + sourceId only when workspaceId is omitted", async () => {
    mockDbFindFirst.mockResolvedValue({ id: "contact-inbox-1" })

    const result = await contactInboxService.findLatestBySource({
      inboxId: "inbox-1",
      sourceId: "guest-1",
    })

    expect(result).toEqual({ id: "contact-inbox-1" })
    expect(mockDbFindFirst).toHaveBeenCalledWith({
      where: { inboxId: "inbox-1", sourceId: "guest-1" },
      orderBy: { lastMessageAt: "desc" },
    })
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  test("findLatestBySource applies workspace scoping when workspaceId is provided", async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: "contact-inbox-1" }])

    const result = await contactInboxService.findLatestBySource({
      inboxId: "inbox-1",
      sourceId: "guest-1",
      workspaceId: "workspace-1",
    })

    expect(result).toEqual({ id: "contact-inbox-1" })
    expect(mockDbSelect).toHaveBeenCalled()
    expect(mockDbFindFirst).not.toHaveBeenCalled()
  })

  test("findLatestBySource returns undefined when workspace-scoped query matches no row", async () => {
    mockDbSelectLimit.mockResolvedValue([])

    const result = await contactInboxService.findLatestBySource({
      inboxId: "inbox-1",
      sourceId: "guest-1",
      workspaceId: "workspace-mismatch",
    })

    expect(result).toBeUndefined()
  })

  test("findRecentByContactId does not mutate cached contact inbox order", async () => {
    const olderInbox = {
      id: "contact-inbox-older",
      lastMessageAt: new Date("2026-07-01T00:00:00.000Z"),
    }
    const newerInbox = {
      id: "contact-inbox-newer",
      lastMessageAt: new Date("2026-07-02T00:00:00.000Z"),
    }
    const cachedContactInboxes = [olderInbox, newerInbox]
    const listSpy = vi
      .spyOn(contactInboxService, "listByContactId")
      .mockResolvedValue(cachedContactInboxes as never)

    const result = await contactInboxService.findRecentByContactId({
      contactId: "contact-1",
    })

    expect(result).toBe(newerInbox)
    expect(cachedContactInboxes).toEqual([olderInbox, newerInbox])
    listSpy.mockRestore()
  })

  test("updateTracking does not infer firstInteractionAt from lastMessageAt", async () => {
    const lastMessageAt = new Date("2026-07-09T07:43:30.676Z")

    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: { lastMessageAt },
    })

    expect(mockDbUpdate).toHaveBeenCalled()
    expect(mockDbSet).toHaveBeenCalledWith({ lastMessageAt })
  })

  test("updateTracking stores explicit firstInteractionAt as an earliest timestamp", async () => {
    const firstInteractionAt = new Date("2026-05-11T04:02:22.000Z")
    const lastMessageAt = new Date("2026-07-09T07:43:30.676Z")

    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: { firstInteractionAt, lastMessageAt },
    })

    expect(mockDbSet).toHaveBeenCalledWith({
      firstInteractionAt: {
        strings: [
          "CASE WHEN ",
          " IS NULL OR ",
          " > ",
          " THEN ",
          " ELSE ",
          " END",
        ],
        values: [
          "firstInteractionAt",
          "firstInteractionAt",
          firstInteractionAt,
          firstInteractionAt,
          "firstInteractionAt",
        ],
      },
      lastMessageAt,
    })
  })

  test("updateTracking merges only populated referral keys", async () => {
    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: {
        referral: {
          adTitle: null,
          ctwaClid: "clid-1",
          raw: {},
          sourceUrl: "https://example.com/ad",
        },
      },
    })

    expect(mockDbSet).toHaveBeenCalledWith({
      referral: {
        strings: ["COALESCE(", ", '{}'::jsonb) || ", "::jsonb"],
        values: [
          "referral",
          JSON.stringify({
            ctwaClid: "clid-1",
            sourceUrl: "https://example.com/ad",
          }),
        ],
      },
    })
  })

  test("updateTracking returns post-commit invalidation without purging inside a transaction", async () => {
    const tx = {
      update: mockDbUpdate,
    }

    const result = await contactInboxService.updateTracking({
      tx: tx as never,
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: { lastMessageAt: new Date("2026-07-09T07:43:30.676Z") },
    })

    expect(result).toEqual({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
  })

  test("updateTracking skips empty updates", async () => {
    const result = await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: { referral: null },
    })

    expect(result).toBeNull()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("updateTracking guards last user input with the incoming timestamp", async () => {
    const incomingAt = new Date("2026-07-09T07:43:30.676Z")

    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: {
        lastIncomingMessageAt: incomingAt,
        lastUserInput: "hello",
        lastUserInputType: "text",
      },
    })

    const update = mockDbSet.mock.calls[0][0] as Record<string, unknown>
    expect(update).toHaveProperty("lastIncomingMessageAt")
    expect(update).toHaveProperty("lastUserInput")
    expect(update).toHaveProperty("lastUserInputType")
  })

  test("updateTracking logs and returns null when workspace scope matches no row", async () => {
    mockDbReturning.mockResolvedValueOnce([])

    const result = await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "wrong-workspace",
      data: { lastMessageAt: new Date("2026-07-09T07:43:30.676Z") },
    })

    expect(result).toBeNull()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        contactInboxId: "contact-inbox-1",
        contactId: "contact-1",
        operation: "updateTracking",
        workspaceId: "wrong-workspace",
      },
      "ContactInbox tracking update skipped because workspace scope did not match",
    )
  })

  test("bulkUpdateTracking issues one statement and dedupes invalidation tags", async () => {
    const result = await contactInboxService.bulkUpdateTracking({
      rows: [
        {
          contactInboxId: "contact-inbox-1",
          contactId: "contact-1",
          workspaceId: "workspace-1",
          firstInteractionAt: new Date("2026-07-01T00:00:00.000Z"),
          lastMessageAt: new Date("2026-07-02T00:00:00.000Z"),
          lastIncomingMessageAt: new Date("2026-07-02T00:00:00.000Z"),
        },
        {
          contactInboxId: "contact-inbox-2",
          contactId: "contact-1",
          workspaceId: "workspace-1",
          firstInteractionAt: new Date("2026-07-03T00:00:00.000Z"),
          lastMessageAt: new Date("2026-07-04T00:00:00.000Z"),
          lastIncomingMessageAt: null,
        },
      ],
    })

    expect(mockDbExecute).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
  })

  test("bulkUpdateTracking clamps timestamps with null-ignoring GREATEST/LEAST", async () => {
    await contactInboxService.bulkUpdateTracking({
      rows: [
        {
          contactInboxId: "contact-inbox-1",
          contactId: "contact-1",
          workspaceId: "workspace-1",
          firstInteractionAt: new Date("2026-07-01T00:00:00.000Z"),
          lastMessageAt: new Date("2026-07-02T00:00:00.000Z"),
          lastIncomingMessageAt: null,
        },
      ],
    })

    const statement = (
      mockDbExecute.mock.calls[0][0] as { strings: string[] }
    ).strings.join(" ")

    // Postgres GREATEST/LEAST ignore NULLs, so they keep the existing value
    // when the incoming one is NULL and vice versa — same semantics the
    // previous CASE expressions guarded by hand.
    expect(statement).toContain('LEAST(t."firstInteractionAt", u.first_ts)')
    expect(statement).toContain('GREATEST(t."lastMessageAt", u.message_ts)')
    expect(statement).toContain(
      'GREATEST(t."lastIncomingMessageAt", u.incoming_ts)',
    )
    expect(statement).not.toContain("CASE")
  })
})
