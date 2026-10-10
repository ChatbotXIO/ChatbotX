import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

const STORED_FIRST_COALESCE_RE = /COALESCE\(\s*,/

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
  mockDbTransaction,
  mockDbWhere,
  mockInArray,
  mockInvalidateCacheByTags,
  mockLoggerWarn,
  mockOr,
  mockIsUniqueViolationError,
  mockFindWithContact,
  mockUpdateIdentityGuarded,
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
    mockDbTransaction: vi.fn(),
    mockDbWhere,
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({
      field,
      values,
    })),
    mockInvalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
    mockLoggerWarn,
    mockOr: vi.fn((...conditions: unknown[]) => ({ or: conditions })),
    mockIsUniqueViolationError: vi.fn().mockReturnValue(false),
    mockFindWithContact: vi.fn(),
    mockUpdateIdentityGuarded: vi.fn(),
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
  asc: vi.fn((field: unknown) => ({ asc: field })),
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
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
  lte: vi.fn((field: unknown, value: unknown) => ({ lte: [field, value] })),
  or: mockOr,
  isUniqueViolationError: mockIsUniqueViolationError,
  sql: mockSql,
}))

// This suite never exercises `listByContactIdUncached`, but vitest's SSR deps
// optimizer bundles the whole `@chatbotx.io/database` package graph together
// once any subpath is imported, which otherwise pulls in
// `contactInboxRepository`'s real contact-filter query graph (needs the real
// schema, conflicting with the narrow mock below).
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxOperationalColumns: { sourceIdentityHistory: false },
  contactInboxRepository: {
    findWithContact: mockFindWithContact,
    updateIdentityGuarded: mockUpdateIdentityGuarded,
  },
  contactInboxPostRepository: {
    lockWorkspaceForPostWrite: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  CONTACT_INBOX_IDENTITY_CHANGE_REASONS: {
    parentFallback: "parentFallback",
    phoneChanged: "phoneChanged",
    userIdChanged: "userIdChanged",
  },
  CONTACT_INBOX_SOURCE_ID_KEY: "ContactInbox_inboxId_sourceId_key",
  CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY:
    "ContactInbox_inboxId_sourceParentUserId_key",
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
    followsBusiness: "followsBusiness",
    followerCount: "followerCount",
    businessFollowsContact: "businessFollowsContact",
    profileSnapshotAttempts: "profileSnapshotAttempts",
    profileSnapshotNextAttemptAt: "profileSnapshotNextAttemptAt",
    profileSnapshotState: "profileSnapshotState",
    accountVerified: "accountVerified",
    lastIncomingMessageAt: "lastIncomingMessageAt",
    lastMessageAt: "lastMessageAt",
    lastUserInput: "lastUserInput",
    lastUserInputType: "lastUserInputType",
    referral: "referral",
    sourceId: "sourceId",
    sourceParentUserId: "sourceParentUserId",
    sourceUserId: "sourceUserId",
    sourceUsername: "sourceUsername",
  },
  inboxModel: { channel: "channel", id: "inboxId", workspaceId: "workspaceId" },
  workspaceModel: {
    id: "workspace.id",
    purgeStartedAt: "workspace.purgeStartedAt",
    scheduledDeletionAt: "workspace.scheduledDeletionAt",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("../src/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}))

/** Full-referral JSON param of the guarded (newest-click-wins) merge SQL. */
const guardedFullPayload = (query: SQL): string => {
  const { params } = new PgDialect().sqlToQuery(query)
  return params.at(-1) as string
}

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
      workspaceId: "workspace-1",
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

  test("updateTracking keeps explicit null only for the Google click keys", async () => {
    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: {
        referral: {
          gclid: null,
          gbraid: "gb-1",
          googleCampaignId: null,
          googleAdGroupId: null,
          googleAdId: null,
          googleClickReceivedAt: "2026-10-01T00:00:00.000Z",
          adTitle: null,
          ctwaClid: null,
          raw: {},
        },
      },
    })

    const payload = guardedFullPayload(mockDbSet.mock.calls[0][0].referral)
    expect(JSON.parse(payload)).toEqual({
      gclid: null,
      gbraid: "gb-1",
      googleCampaignId: null,
      googleAdGroupId: null,
      googleAdId: null,
      googleClickReceivedAt: "2026-10-01T00:00:00.000Z",
    })
  })

  test("updateTracking still writes a referral made only of Google nulls", async () => {
    await contactInboxService.updateTracking({
      contactInboxId: "contact-inbox-1",
      contactId: "contact-1",
      workspaceId: "workspace-1",
      data: { referral: { gclid: null, adTitle: null } },
    })

    expect(mockDbSet).toHaveBeenCalledTimes(1)
    const payload = mockDbSet.mock.calls[0][0].referral.values[1] as string
    expect(JSON.parse(payload)).toEqual({ gclid: null })
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

  // Coexist history sync dates a contact inbox from the first synced message;
  // every other caller leaves `createdAt` unset, which LEAST turns into a
  // no-op for that column.
  test("bulkUpdateTracking backdates createdAt only when a row carries it", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z")
    await contactInboxService.bulkUpdateTracking({
      rows: [
        {
          contactInboxId: "contact-inbox-1",
          contactId: "contact-1",
          workspaceId: "workspace-1",
          firstInteractionAt: createdAt,
          lastMessageAt: new Date("2026-07-02T00:00:00.000Z"),
          lastIncomingMessageAt: null,
          createdAt,
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

    const call = mockDbExecute.mock.calls[0][0] as {
      strings: string[]
      values: unknown[]
    }
    expect(call.strings.join(" ")).toContain(
      '"createdAt" = LEAST(t."createdAt", u.created_ts)',
    )
    // `mockSql.join` captures the per-row `sql` fragments; the last value of
    // each is the `created_ts` operand.
    const rows = call.values[0] as { chunks: Array<{ values: unknown[] }> }
    expect(rows.chunks[0]?.values.at(-1)).toBe(createdAt)
    expect(rows.chunks[1]?.values.at(-1)).toBeNull()
  })
})

describe("contactInboxService.completeProfileSnapshot", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({ update: mockDbUpdate }),
    )
    const { contactInboxPostRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    vi.mocked(
      contactInboxPostRepository.lockWorkspaceForPostWrite,
    ).mockResolvedValue(true)
  })

  test("commits an all-null snapshot only for the current pending claim", async () => {
    mockDbReturning.mockResolvedValueOnce([{ contactId: "contact-1" }])

    await expect(
      contactInboxService.completeProfileSnapshot({
        attempt: 2,
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        outcome: "captured",
        snapshot: {
          followsBusiness: null,
          followerCount: null,
          businessFollowsContact: null,
          accountVerified: null,
        },
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(true)

    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        profileSnapshotNextAttemptAt: null,
        profileSnapshotState: "captured",
      }),
    )
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
    expect(
      mockDbSet.mock.calls[0]?.[0].followsBusiness.strings.join(" "),
    ).toContain("CASE WHEN")
    expect(mockDbSet.mock.calls[0]?.[0].followsBusiness.values).toContain(null)
    expect(mockDbSet.mock.calls[0]?.[0].profileSnapshotState).toBe("captured")
    expect(mockDbReturning).toHaveBeenCalledOnce()
    expect(
      (await import("@chatbotx.io/database/client")).eq,
    ).toHaveBeenCalledWith("profileSnapshotState", "pending")
    expect(
      (await import("@chatbotx.io/database/client")).eq,
    ).toHaveBeenCalledWith("profileSnapshotAttempts", 2)
    const where = mockDbWhere.mock.calls[0]?.[0] as {
      conditions: Array<{ values?: unknown[] }>
    }
    expect(where.conditions.at(-1)?.values).toContain("workspace-1")
  })

  test("refresh skips the write when nothing was fetched", async () => {
    await contactInboxService.refreshProfileSnapshot({
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      snapshot: {
        followsBusiness: null,
        businessFollowsContact: null,
        accountVerified: null,
        followerCount: null,
      },
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("refresh keeps stored values for fields the API omitted and never fabricates false/0", async () => {
    mockDbReturning.mockResolvedValueOnce([{ contactId: "contact-1" }])

    await contactInboxService.refreshProfileSnapshot({
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      snapshot: {
        followsBusiness: false,
        businessFollowsContact: null,
        accountVerified: null,
        followerCount: 0,
        username: "ada",
      },
    })

    const update = mockDbSet.mock.calls[0]?.[0]
    const coalesced = (column: string) =>
      update[column] as { strings: string[]; values: unknown[] }
    for (const column of [
      "followsBusiness",
      "businessFollowsContact",
      "accountVerified",
      "followerCount",
    ]) {
      expect(coalesced(column).strings.join(" ")).toContain("COALESCE")
    }
    // Genuine false / 0 are written, null stays null so COALESCE keeps the row's value.
    expect(coalesced("followsBusiness").values).toContain(false)
    expect(coalesced("followerCount").values).toContain(0)
    expect(coalesced("businessFollowsContact").values).toContain(null)
    expect(coalesced("accountVerified").values).toContain(null)
    expect(update.profileSnapshotState).toBeUndefined()
  })

  test("refresh only backfills an empty sourceUsername", async () => {
    mockDbReturning.mockResolvedValueOnce([{ contactId: "contact-1" }])

    await contactInboxService.refreshProfileSnapshot({
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      snapshot: {
        followsBusiness: null,
        businessFollowsContact: null,
        accountVerified: null,
        followerCount: null,
        username: "ada",
      },
    })

    const sourceUsername = mockDbSet.mock.calls[0]?.[0].sourceUsername as {
      strings: string[]
      values: unknown[]
    }
    // Stored handle is the first COALESCE operand, so it always wins.
    expect(sourceUsername.strings.join(" ")).toMatch(STORED_FIRST_COALESCE_RE)
    expect(sourceUsername.values).toContain("ada")
  })

  test("uses CASE expressions to preserve values from another source", async () => {
    mockDbReturning.mockResolvedValueOnce([{ contactId: "contact-1" }])

    await contactInboxService.completeProfileSnapshot({
      attempt: 2,
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      outcome: "captured",
      snapshot: {
        followsBusiness: true,
        followerCount: 42,
        businessFollowsContact: false,
        accountVerified: true,
      },
      workspaceId: "workspace-1",
    })

    const update = mockDbSet.mock.calls[0]?.[0]
    const snapshotColumns = [
      ["followsBusiness", true],
      ["businessFollowsContact", false],
      ["accountVerified", true],
      ["followerCount", 42],
    ] as const
    for (const [column, incomingValue] of snapshotColumns) {
      const caseExpression = update[column] as {
        strings: string[]
        values: unknown[]
      }
      const guard = caseExpression.values[0] as {
        values: unknown[]
      }

      expect(caseExpression.strings.join(" ")).toContain("CASE WHEN")
      expect(caseExpression.values).toContain(incomingValue)
      expect(caseExpression.values).toContain(column)
      for (const guardedColumn of snapshotColumns.map(([name]) => name)) {
        expect(guard.values).toContain(guardedColumn)
      }
    }
  })

  test("invalidates the contact cache only after the snapshot transaction commits", async () => {
    let releaseCommit: (() => void) | undefined
    const commit = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    mockDbTransaction.mockImplementation(async (callback) => {
      const result = await callback({ update: mockDbUpdate })
      await commit
      return result
    })
    mockDbReturning.mockResolvedValueOnce([{ contactId: "contact-1" }])

    const completing = contactInboxService.completeProfileSnapshot({
      attempt: 2,
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      outcome: "captured",
      snapshot: {
        followsBusiness: null,
        followerCount: null,
        businessFollowsContact: null,
        accountVerified: null,
      },
      workspaceId: "workspace-1",
    })
    await vi.waitFor(() => expect(mockDbReturning).toHaveBeenCalledOnce())

    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
    releaseCommit?.()

    await expect(completing).resolves.toBe(true)
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
  })

  test("does not invalidate when a newer claim has already completed", async () => {
    mockDbReturning.mockResolvedValueOnce([])

    await expect(
      contactInboxService.completeProfileSnapshot({
        attempt: 1,
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        outcome: "failed",
        snapshot: {
          followsBusiness: null,
          followerCount: null,
          businessFollowsContact: null,
          accountVerified: null,
        },
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(false)

    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("terminal recovery requires that the claimed lease has expired", async () => {
    mockDbReturning.mockResolvedValueOnce([])

    await contactInboxService.completeProfileSnapshot({
      attempt: 5,
      contactInboxId: "contact-inbox-1",
      inboxId: "inbox-1",
      onlyIfLeaseExpired: true,
      outcome: "failed",
      snapshot: {
        followsBusiness: null,
        followerCount: null,
        businessFollowsContact: null,
        accountVerified: null,
      },
      workspaceId: "workspace-1",
    })

    expect(
      (await import("@chatbotx.io/database/client")).lte,
    ).toHaveBeenCalledWith("profileSnapshotNextAttemptAt", expect.any(Date))
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })
})

describe("contactInboxService Instagram snapshot recovery queries", () => {
  const mockRecoveryQuery = (rows: unknown[]) => {
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn(() => ({ limit }))
    const where = vi.fn(() => ({ orderBy }))
    const innerJoin = vi.fn(() => ({ innerJoin, where }))
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({ innerJoin })),
    })
    return { innerJoin, where }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("excludes fenced workspaces before recovery pagination", async () => {
    mockRecoveryQuery([])

    await expect(
      contactInboxService.listDueProfileSnapshots({ limit: 100 }),
    ).resolves.toEqual([])

    const { isNull } = await import("@chatbotx.io/database/client")
    expect(isNull).toHaveBeenCalledWith("workspace.purgeStartedAt")
    expect(isNull).toHaveBeenCalledWith("workspace.scheduledDeletionAt")
  })

  test("limits both recovery scans to profile-snapshot capable channels", async () => {
    mockRecoveryQuery([])
    mockRecoveryQuery([])

    await contactInboxService.listDueProfileSnapshots({ limit: 100 })
    await contactInboxService.listExhaustedProfileSnapshots({ limit: 100 })

    const inArrayCalls = mockInArray.mock.calls.filter(
      ([field]) => field === "channel",
    )
    expect(inArrayCalls).toHaveLength(2)
    for (const [, channels] of inArrayCalls) {
      expect(channels).toEqual(["instagram"])
    }
  })

  test("selects exhausted work only after its lease deadline", async () => {
    mockRecoveryQuery([])

    await expect(
      contactInboxService.listExhaustedProfileSnapshots({ limit: 100 }),
    ).resolves.toEqual([])

    const { lte } = await import("@chatbotx.io/database/client")
    expect(lte).toHaveBeenCalledWith(
      "profileSnapshotNextAttemptAt",
      expect.any(Date),
    )
  })
})

describe("contactInboxService Instagram snapshot claim and retry", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { contactInboxPostRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    vi.mocked(
      contactInboxPostRepository.lockWorkspaceForPostWrite,
    ).mockResolvedValue(true)
  })

  test("claims only a due pending row and fences the increment by its attempt", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([
        { attempts: 0, channel: "instagram", sourceId: "igsid-1" },
      ])
    const where = vi.fn(() => ({ for: vi.fn(() => ({ limit })) }))
    const txSelect = vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where })),
      })),
    }))
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({ select: txSelect, update: mockDbUpdate }),
    )
    mockDbReturning.mockResolvedValueOnce([{ id: "contact-inbox-1" }])

    await expect(
      contactInboxService.claimProfileSnapshot({
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({
      attempt: 1,
      channel: "instagram",
      sourceId: "igsid-1",
    })

    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        profileSnapshotAttempts: 1,
        profileSnapshotNextAttemptAt: expect.any(Date),
      }),
    )
    expect(
      (await import("@chatbotx.io/database/client")).eq,
    ).toHaveBeenCalledWith("profileSnapshotAttempts", 0)
    const { eq, lte } = await import("@chatbotx.io/database/client")
    expect(eq).toHaveBeenCalledWith("profileSnapshotState", "pending")
    expect(eq).toHaveBeenCalledWith("inboxId", "inbox-1")
    expect(eq).toHaveBeenCalledWith("workspaceId", "workspace-1")
    expect(mockInArray).toHaveBeenCalledWith("channel", ["instagram"])
    expect(lte).toHaveBeenCalledWith(
      "profileSnapshotNextAttemptAt",
      expect.any(Date),
    )
    const whereClause = where.mock.calls[0]?.[0] as {
      conditions: Array<{ values?: unknown[] }>
    }
    expect(
      whereClause.conditions.some((condition) => condition.values?.includes(5)),
    ).toBe(true)
  })

  test("backs off retryable claims and terminalizes the fifth attempt", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T00:00:00.000Z"))
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({ update: mockDbUpdate }),
    )
    mockDbReturning.mockResolvedValueOnce([{ state: "pending" }])

    await expect(
      contactInboxService.rescheduleProfileSnapshot({
        attempt: 1,
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe("pending")
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        profileSnapshotNextAttemptAt: new Date("2026-09-30T00:00:30.000Z"),
        profileSnapshotState: "pending",
      }),
    )

    mockDbReturning.mockResolvedValueOnce([{ state: "failed" }])
    await expect(
      contactInboxService.rescheduleProfileSnapshot({
        attempt: 5,
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe("failed")
    expect(mockDbSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profileSnapshotNextAttemptAt: null,
        profileSnapshotState: "failed",
      }),
    )
    vi.useRealTimers()
  })

  test("does not write a claim or retry when the workspace fence rejects it", async () => {
    const { contactInboxPostRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    vi.mocked(
      contactInboxPostRepository.lockWorkspaceForPostWrite,
    ).mockResolvedValue(false)
    mockDbTransaction.mockImplementation(async (callback) =>
      callback({ update: mockDbUpdate }),
    )

    await expect(
      contactInboxService.rescheduleProfileSnapshot({
        attempt: 1,
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})

describe("contactInboxService.syncScopedIdentity (WhatsApp BSUID support, D3)", () => {
  const baseContactInbox = {
    id: "ci-1",
    inboxId: "inbox-1",
    contactId: "contact-1",
    sourceId: "84900000001",
    sourceParentUserId: null,
    sourceUserId: null,
    sourceUsername: null,
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsUniqueViolationError.mockReturnValue(false)
    mockUpdateIdentityGuarded.mockReset()
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

  test("backfills sourceParentUserId when currently null", async () => {
    mockDbReturning.mockResolvedValueOnce([
      { ...baseContactInbox, sourceParentUserId: "parent.bsuid-1" },
    ])

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: baseContactInbox,
      incomingContact: {
        sourceId: "84900000001",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy: "sourceId",
    })

    expect(mockDbSet).toHaveBeenCalledWith({
      sourceParentUserId: "parent.bsuid-1",
    })
    expect(contactInbox.sourceParentUserId).toBe("parent.bsuid-1")
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
  })

  test("a parent-key conflict warns with err without losing the sourceUserId backfill", async () => {
    const parentConflict = new Error("duplicate parent identity")
    mockDbReturning
      .mockRejectedValueOnce(parentConflict)
      .mockResolvedValueOnce([
        { ...baseContactInbox, sourceUserId: "user.bsuid-1" },
      ])
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === parentConflict &&
        constraint === "ContactInbox_inboxId_sourceParentUserId_key",
    )

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: baseContactInbox,
      incomingContact: {
        sourceId: "84900000001",
        sourceUserId: "user.bsuid-1",
        sourceParentUserId: "parent.taken",
      },
      matchedBy: "sourceId",
    })

    expect(contactInbox.sourceUserId).toBe("user.bsuid-1")
    expect(contactInbox.sourceParentUserId).toBeNull()
    expect(mockDbSet).toHaveBeenNthCalledWith(1, {
      sourceParentUserId: "parent.taken",
      sourceUserId: "user.bsuid-1",
    })
    expect(mockDbSet).toHaveBeenNthCalledWith(2, {
      sourceUserId: "user.bsuid-1",
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: parentConflict }),
      "ContactInbox.sourceParentUserId backfill skipped: already claimed by another row in this inbox",
    )
  })

  test("a sourceUserId-key conflict retries the combined reveal without losing the parent backfill", async () => {
    const sourceUserIdConflict = new Error("duplicate scoped identity")
    mockDbReturning
      .mockRejectedValueOnce(sourceUserIdConflict)
      .mockResolvedValueOnce([
        {
          ...baseContactInbox,
          sourceParentUserId: "parent.bsuid-1",
        },
      ])
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === sourceUserIdConflict &&
        constraint === "ContactInbox_inboxId_sourceUserId_key",
    )

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: baseContactInbox,
      incomingContact: {
        sourceId: "84900000001",
        sourceUserId: "user.bsuid-taken",
        sourceParentUserId: "parent.bsuid-1",
      },
    })

    expect(contactInbox.sourceUserId).toBeNull()
    expect(contactInbox.sourceParentUserId).toBe("parent.bsuid-1")
    expect(mockDbSet).toHaveBeenNthCalledWith(1, {
      sourceParentUserId: "parent.bsuid-1",
      sourceUserId: "user.bsuid-taken",
    })
    expect(mockDbSet).toHaveBeenNthCalledWith(2, {
      sourceParentUserId: "parent.bsuid-1",
    })
  })

  test("backfills both revealed identities and username with one update and one invalidation", async () => {
    mockDbReturning.mockResolvedValueOnce([
      {
        ...baseContactInbox,
        sourceParentUserId: "parent.bsuid-1",
        sourceUserId: "user.bsuid-1",
        sourceUsername: "@handle",
      },
    ])

    await contactInboxService.syncScopedIdentity({
      contactInbox: baseContactInbox,
      incomingContact: {
        sourceId: "84900000001",
        sourceParentUserId: "parent.bsuid-1",
        sourceUserId: "user.bsuid-1",
        sourceUsername: "@handle",
      },
    })

    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockDbSet).toHaveBeenCalledWith({
      sourceParentUserId: "parent.bsuid-1",
      sourceUserId: "user.bsuid-1",
      sourceUsername: "@handle",
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledTimes(1)
  })

  test("advances sourceId and sourceUserId on a phone-keyed row matched by parent", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue({
      ...existing,
      sourceId: "84900000002",
      sourceUserId: "user.bsuid-new",
    })

    const { contactInbox, phoneTransition } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: existing,
        incomingContact: {
          sourceId: "84900000002",
          sourceUserId: "user.bsuid-new",
          sourceParentUserId: "parent.bsuid-1",
        },
        matchedBy: "sourceParentUserId",
      })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceParentUserId: "parent.bsuid-1",
          sourceUserId: "user.bsuid-old",
        },
        set: {
          sourceId: "84900000002",
          sourceUserId: "user.bsuid-new",
        },
      }),
      expect.anything(),
    )
    expect(contactInbox.sourceId).toBe("84900000002")
    expect(contactInbox.sourceUserId).toBe("user.bsuid-new")
    expect(phoneTransition).toEqual({
      previousPhone: "84900000001",
      newPhone: "84900000002",
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
  })

  test("rekeys a phone-keyed row to a hidden BSUID without reporting a phone transition", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue({
      ...existing,
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
    })

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: existing,
        incomingContact: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
          sourceParentUserId: "parent.bsuid-1",
        },
        matchedBy: "sourceParentUserId",
      })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        guard: {
          sourceId: "84900000001",
          sourceParentUserId: "parent.bsuid-1",
          sourceUserId: "user.bsuid-old",
        },
        set: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
        },
      }),
      expect.anything(),
    )
    expect(contactInbox.sourceId).toBe("user.bsuid-new")
    expect(contactInbox.sourceUserId).toBe("user.bsuid-new")
    expect(learnedPrimaryIdentity).toBeUndefined()
  })

  test("does no further writes for a hidden-phone message after the BSUID re-key", async () => {
    const alreadyRekeyed = {
      ...baseContactInbox,
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
      sourceParentUserId: "parent.bsuid-1",
    }

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: alreadyRekeyed,
        incomingContact: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
          sourceParentUserId: "parent.bsuid-1",
        },
        matchedBy: "sourceId",
      })

    expect(contactInbox).toEqual(alreadyRekeyed)
    expect(learnedPrimaryIdentity).toBeUndefined()
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("advances sourceId and sourceUserId on a BSUID-keyed row matched by parent", async () => {
    const existing = {
      ...baseContactInbox,
      sourceId: "user.bsuid-old",
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue({
      ...existing,
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
    })

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: existing,
        incomingContact: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
          sourceParentUserId: "parent.bsuid-1",
        },
        matchedBy: "sourceParentUserId",
      })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        guard: {
          sourceId: "user.bsuid-old",
          sourceParentUserId: "parent.bsuid-1",
          sourceUserId: "user.bsuid-old",
        },
        set: {
          sourceId: "user.bsuid-new",
          sourceUserId: "user.bsuid-new",
        },
      }),
      expect.anything(),
    )
    expect(contactInbox.sourceId).toBe("user.bsuid-new")
    expect(learnedPrimaryIdentity).toBeUndefined()
  })

  test("returns the current database row when a guarded rotation is stale", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    const current = {
      ...existing,
      sourceUserId: "user.bsuid-concurrent",
    }
    mockUpdateIdentityGuarded.mockResolvedValue(undefined)
    mockDbFindFirst.mockResolvedValueOnce(current)

    await expect(
      contactInboxService.rotateScopedUserIdGuarded({
        contactInbox: existing,
        guard: { sourceUserId: "user.bsuid-old" },
        set: { sourceUserId: "user.bsuid-new" },
        conflictLogMessage: "rotation conflict",
        reason: "userIdChanged",
      }),
    ).resolves.toEqual({
      contactInbox: current,
      invalidation: null,
      status: "stale",
    })

    expect(mockDbFindFirst).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      columns: { sourceIdentityHistory: false },
    })
  })

  test("returns applied without issuing an update when the requested set is already present", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-current",
    }

    await expect(
      contactInboxService.rotateScopedUserIdGuarded({
        contactInbox: existing,
        guard: { sourceUserId: "user.bsuid-current" },
        set: { sourceUserId: "user.bsuid-current" },
        conflictLogMessage: "rotation conflict",
        reason: "userIdChanged",
      }),
    ).resolves.toEqual({
      contactInbox: existing,
      invalidation: null,
      status: "applied",
    })
    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
  })

  test("returns and logs the identity constraint that caused a rotation conflict", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
    }
    const conflict = new Error("duplicate scoped identity")
    mockUpdateIdentityGuarded.mockRejectedValue(conflict)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === conflict &&
        constraint === "ContactInbox_inboxId_sourceUserId_key",
    )

    await expect(
      contactInboxService.rotateScopedUserIdGuarded({
        contactInbox: existing,
        guard: { sourceUserId: "user.bsuid-old" },
        set: { sourceUserId: "user.bsuid-taken" },
        conflictLogMessage: "rotation conflict",
        reason: "userIdChanged",
      }),
    ).resolves.toEqual({
      contactInbox: existing,
      constraint: "ContactInbox_inboxId_sourceUserId_key",
      invalidation: null,
      status: "conflict",
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        constraint: "ContactInbox_inboxId_sourceUserId_key",
        err: conflict,
      }),
      "rotation conflict",
    )
  })

  test("returns identity-backfill invalidation without applying it inside a caller-supplied transaction", async () => {
    mockDbReturning.mockResolvedValueOnce([
      { ...baseContactInbox, sourceParentUserId: "parent.bsuid-1" },
    ])
    const tx = { update: mockDbUpdate }

    const result = await contactInboxService.syncScopedIdentity({
      tx: tx as never,
      contactInbox: baseContactInbox,
      incomingContact: {
        sourceId: "84900000001",
        sourceParentUserId: "parent.bsuid-1",
      },
    })

    expect(result.invalidation).toEqual({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("returns guarded-rotation invalidation without applying it inside a caller-supplied transaction", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
    }
    mockUpdateIdentityGuarded.mockResolvedValue({
      ...existing,
      sourceUserId: "user.bsuid-new",
    })
    const tx = {
      transaction: (run: (innerTx: unknown) => unknown) => run({}),
    } as never

    const result = await contactInboxService.rotateScopedUserIdGuarded({
      tx,
      contactInbox: existing,
      guard: { sourceUserId: "user.bsuid-old" },
      set: { sourceUserId: "user.bsuid-new" },
      conflictLogMessage: "rotation conflict",
      reason: "userIdChanged",
    })

    expect(result.invalidation).toEqual({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test.each([
    "sourceId",
    "sourceUserId",
  ] as const)("does not advance when the row was matched by %s", async (matchedBy) => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "84900000002",
        sourceUserId: "user.bsuid-new",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy,
    })

    expect(mockUpdateIdentityGuarded).not.toHaveBeenCalled()
    expect(contactInbox.sourceUserId).toBe("user.bsuid-old")
  })

  test("warns and keeps the row when the new BSUID is owned by another row", async () => {
    const existing = {
      ...baseContactInbox,
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    const conflict = new Error("duplicate BSUID")
    mockUpdateIdentityGuarded.mockRejectedValue(conflict)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown) => error === conflict,
    )

    const { contactInbox, learnedPrimaryIdentity } =
      await contactInboxService.syncScopedIdentity({
        contactInbox: existing,
        incomingContact: {
          sourceId: "84900000002",
          sourceUserId: "user.bsuid-taken",
          sourceParentUserId: "parent.bsuid-1",
        },
        matchedBy: "sourceParentUserId",
      })

    expect(contactInbox).toEqual(existing)
    expect(learnedPrimaryIdentity).toBeUndefined()
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: conflict }),
      expect.stringContaining("rotation skipped"),
    )
  })

  test("does not learn a phone when a BSUID-keyed parent rotation conflicts", async () => {
    const existing = {
      ...baseContactInbox,
      sourceId: "user.bsuid-old",
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    const conflict = new Error("duplicate BSUID")
    mockUpdateIdentityGuarded.mockRejectedValue(conflict)
    mockIsUniqueViolationError.mockImplementation(
      (error: unknown) => error === conflict,
    )

    const result = await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "84900000002",
        sourceUserId: "user.bsuid-new",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy: "sourceParentUserId",
    })

    expect(result.learnedPrimaryIdentity).toBeUndefined()
  })

  test("does not learn a phone when a BSUID-keyed parent rotation is stale", async () => {
    const existing = {
      ...baseContactInbox,
      sourceId: "user.bsuid-old",
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue(undefined)
    mockDbFindFirst.mockResolvedValueOnce(existing)

    const result = await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "84900000002",
        sourceUserId: "user.bsuid-new",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy: "sourceParentUserId",
    })

    expect(result.learnedPrimaryIdentity).toBeUndefined()
  })

  test("always guards the old sourceId during a parent rotation", async () => {
    const existing = {
      ...baseContactInbox,
      sourceId: "",
      sourceUserId: "user.bsuid-old",
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue({
      ...existing,
      sourceId: "user.bsuid-new",
      sourceUserId: "user.bsuid-new",
    })

    await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "",
        sourceUserId: "user.bsuid-new",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy: "sourceParentUserId",
    })

    expect(mockUpdateIdentityGuarded).toHaveBeenCalledWith(
      expect.objectContaining({
        guard: expect.objectContaining({ sourceId: "" }),
      }),
      expect.anything(),
    )
  })

  test("does not retry with a weaker null-only guard when the parent rotation is stale", async () => {
    const existing = {
      ...baseContactInbox,
      sourceParentUserId: "parent.bsuid-1",
    }
    mockUpdateIdentityGuarded.mockResolvedValue(undefined)
    mockDbFindFirst.mockResolvedValueOnce(existing)

    const { contactInbox } = await contactInboxService.syncScopedIdentity({
      contactInbox: existing,
      incomingContact: {
        sourceId: "84900000001",
        sourceUserId: "user.bsuid-new",
        sourceParentUserId: "parent.bsuid-1",
      },
      matchedBy: "sourceParentUserId",
    })

    expect(contactInbox).toEqual(existing)
    expect(mockDbUpdate).not.toHaveBeenCalled()
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
    mockIsUniqueViolationError.mockImplementation(
      (_error: unknown, constraint?: string) =>
        constraint === "ContactInbox_inboxId_sourceUserId_key",
    )

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

    expect(learnedPrimaryIdentity).toEqual({ value: "84900000002" })
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
