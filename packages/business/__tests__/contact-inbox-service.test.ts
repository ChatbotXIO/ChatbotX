import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbExecute,
  mockDbFindFirst,
  mockDbFindMany,
  mockDbReturning,
  mockDbSelect,
  mockDbSelectJoinLimit,
  mockDbSelectLimit,
  mockDbSelectWhereRows,
  mockDbSet,
  mockDbUpdate,
  mockInArray,
  mockLoggerWarn,
  mockOr,
  mockIsUniqueViolationError,
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
  // `.where(...)` is used two ways by the service: `findLatestBySource`
  // chains `.orderBy().limit()` off it, while `findExistingSourceIdentities`
  // awaits it directly for the row array. `mockDbSelectWhereRows` resolves
  // the latter; attaching `.orderBy` on top of the Promise instance keeps the
  // former chain working unchanged.
  const mockDbSelectWhereRows = vi.fn().mockResolvedValue([] as unknown[])
  const mockDbSelectWhere = vi.fn(() =>
    Object.assign(mockDbSelectWhereRows(), { orderBy: mockDbSelectOrderBy }),
  )
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
    mockDbSelectWhereRows,
    mockDbSet,
    mockDbUpdate: vi.fn().mockReturnValue(updateChain),
    mockDbWhere,
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({
      field,
      values,
    })),
    mockLoggerWarn,
    mockOr: vi.fn((...conditions: unknown[]) => ({ or: conditions })),
    mockIsUniqueViolationError: vi.fn().mockReturnValue(false),
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
  inArray: mockInArray,
  isNull: vi.fn((field: unknown) => ({ isNull: field })),
  or: mockOr,
  isUniqueViolationError: mockIsUniqueViolationError,
  sql: mockSql,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  CONTACT_INBOX_SOURCE_USER_ID_KEY: "ContactInbox_inboxId_sourceUserId_key",
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
    sourceUserId: "sourceUserId",
    sourceUsername: "sourceUsername",
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

describe("contactInboxService.syncScopedIdentity (WhatsApp BSUID support, D3)", () => {
  const baseContactInbox = {
    id: "ci-1",
    inboxId: "inbox-1",
    contactId: "contact-1",
    sourceId: "84900000001",
    sourceUserId: null,
    sourceUsername: null,
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsUniqueViolationError.mockReturnValue(false)
  })

  test("backfills sourceUserId when currently null", async () => {
    mockDbReturning.mockResolvedValueOnce([
      { ...baseContactInbox, sourceUserId: "user.bsuid-1" },
    ])

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: baseContactInbox,
        incomingContact: {
          sourceId: "84900000001",
          sourceUserId: "user.bsuid-1",
        },
      })

    expect(mockDbSet).toHaveBeenCalledWith({ sourceUserId: "user.bsuid-1" })
    expect(contactInbox.sourceUserId).toBe("user.bsuid-1")
    expect(learnedPrimaryIdentity).toBeUndefined()
  })

  test("does not touch sourceUserId when the row already has one", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-existing",
    }

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "84900000001",
        sourceUserId: "user.bsuid-new",
      },
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(contactInbox.sourceUserId).toBe("user.bsuid-existing")
  })

  test("skips the backfill and logs a warning when the sourceUserId is already claimed by another row (unique-violation race)", async () => {
    mockDbReturning.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    )
    mockIsUniqueViolationError.mockReturnValue(true)

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: baseContactInbox,
        incomingContact: {
          sourceId: "84900000001",
          sourceUserId: "user.bsuid-taken",
        },
      })

    expect(contactInbox.sourceUserId).toBeNull()
    expect(learnedPrimaryIdentity).toBeUndefined()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUserId: "user.bsuid-taken" }),
      "ContactInbox.sourceUserId backfill skipped: already claimed by another row in this inbox",
    )
  })

  test("rethrows a non-unique-violation error from the sourceUserId backfill", async () => {
    mockDbReturning.mockRejectedValueOnce(new Error("connection reset"))
    mockIsUniqueViolationError.mockReturnValue(false)

    await expect(
      contactInboxService.syncScopedIdentity({
        contactInbox: baseContactInbox,
        incomingContact: {
          sourceId: "84900000001",
          sourceUserId: "user.bsuid-1",
        },
      }),
    ).rejects.toThrow("connection reset")
  })

  test("upserts sourceUsername on change (display-only)", async () => {
    mockDbReturning.mockResolvedValueOnce([
      { ...baseContactInbox, sourceUsername: "@newhandle" },
    ])

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: { ...baseContactInbox, sourceUsername: "@oldhandle" },
      incomingContact: {
        sourceId: "84900000001",
        sourceUsername: "@newhandle",
      },
    })

    expect(mockDbSet).toHaveBeenCalledWith({ sourceUsername: "@newhandle" })
    expect(contactInbox.sourceUsername).toBe("@newhandle")
  })

  test("does not write sourceUsername when unchanged", async () => {
    await contactInboxService.syncScopedIdentity({
      contactInbox: { ...baseContactInbox, sourceUsername: "@samehandle" },
      incomingContact: {
        sourceId: "84900000001",
        sourceUsername: "@samehandle",
      },
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("returns learnedPrimaryIdentity when a phone becomes visible on a BSUID-keyed row (D2/D3 phone-learned-later)", async () => {
    const bsuidKeyedRow = {
      ...baseContactInbox,
      sourceId: "user.bsuid-2",
      sourceUserId: "user.bsuid-2",
    }

    const { learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: bsuidKeyedRow,
        incomingContact: {
          sourceId: "84900000002",
          sourceUserId: "user.bsuid-2",
        },
      })

    expect(learnedPrimaryIdentity).toBe("84900000002")
  })

  test("never returns learnedPrimaryIdentity for a phone-keyed row (regression safety)", async () => {
    const { learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: baseContactInbox, // sourceId=phone, sourceUserId=null
        incomingContact: { sourceId: "84900000001" },
      })

    expect(learnedPrimaryIdentity).toBeUndefined()
  })

  test("never rewrites ContactInbox.sourceId even when a phone is learned (D2 stability rule)", async () => {
    const bsuidKeyedRow = {
      ...baseContactInbox,
      sourceId: "user.bsuid-3",
      sourceUserId: "user.bsuid-3",
    }

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: bsuidKeyedRow,
      incomingContact: {
        sourceId: "84900000003",
        sourceUserId: "user.bsuid-3",
      },
    })

    expect(contactInbox.sourceId).toBe("user.bsuid-3")
  })
})

describe("contactInboxService.findExistingSourceIdentities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelectWhereRows.mockResolvedValue([])
  })

  test("returns empty sets without querying when both candidate lists are empty", async () => {
    const result = await contactInboxService.findExistingSourceIdentities({
      inboxId: "inbox-1",
      sourceIds: [],
      sourceUserIds: [],
    })

    expect(result).toEqual({ sourceIds: new Set(), sourceUserIds: new Set() })
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  test("matches rows by sourceId alone when no sourceUserIds are given (empty-array guard)", async () => {
    mockDbSelectWhereRows.mockResolvedValue([
      { sourceId: "84900000001", sourceUserId: null },
    ])

    const result = await contactInboxService.findExistingSourceIdentities({
      inboxId: "inbox-1",
      sourceIds: ["84900000001"],
      sourceUserIds: [],
    })

    expect(result).toEqual({
      sourceIds: new Set(["84900000001"]),
      sourceUserIds: new Set(),
    })
    // The empty-array guard: `inArray` must never receive the empty
    // sourceUserIds list — only the sourceId predicate is built.
    expect(mockInArray).toHaveBeenCalledTimes(1)
    expect(mockInArray).toHaveBeenCalledWith("sourceId", ["84900000001"])
  })

  test("matches rows by sourceId OR sourceUserId when both candidate lists are non-empty", async () => {
    mockDbSelectWhereRows.mockResolvedValue([
      { sourceId: "84900000001", sourceUserId: "user.bsuid-1" },
    ])

    const result = await contactInboxService.findExistingSourceIdentities({
      inboxId: "inbox-1",
      sourceIds: ["84900000002"],
      sourceUserIds: ["user.bsuid-1"],
    })

    expect(result).toEqual({
      sourceIds: new Set(["84900000001"]),
      sourceUserIds: new Set(["user.bsuid-1"]),
    })
    expect(mockOr).toHaveBeenCalled()
  })

  test("drops null sourceUserId rows from the returned sourceUserIds set", async () => {
    mockDbSelectWhereRows.mockResolvedValue([
      { sourceId: "84900000001", sourceUserId: null },
      { sourceId: "84900000002", sourceUserId: "user.bsuid-2" },
    ])

    const result = await contactInboxService.findExistingSourceIdentities({
      inboxId: "inbox-1",
      sourceIds: ["84900000001", "84900000002"],
      sourceUserIds: ["user.bsuid-2"],
    })

    expect(result.sourceUserIds).toEqual(new Set(["user.bsuid-2"]))
  })
})
