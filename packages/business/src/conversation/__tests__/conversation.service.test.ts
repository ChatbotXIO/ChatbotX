import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindMany: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findMany: mocks.conversationFindMany,
      },
    },
    // Tagged plain objects (not bare `vi.fn()`) so `.where(cond)` can be
    // asserted on directly — mirrors `tag-service-soft-delete.test.ts`.
    // This is what lets `updateAssignment`'s test below prove the
    // `eq(workspaceId)` clause is actually present in the WHERE, not just
    // that *some* condition was passed.
    update: (..._args: unknown[]) => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return {
          where: (cond: unknown) => {
            mocks.updateWhere(cond)
            return {
              returning: (...rArgs: unknown[]) =>
                mocks.updateReturning(...rArgs),
            }
          },
        }
      },
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  sql: vi.fn(),
}))

// Plain object stubs only — importing the real schema opens a database
// connection through the sharding client. The extra models come from
// `contactService`, now in `conversationService`'s import chain.
vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  workspaceUsageModel: {},
  userQuotaModel: {},
  questionnaireSubmissionModel: {},
  adsConversionEventModel: {},
  refLinkStatModel: {},
  contactsOnSequenceModel: {},
  contactsOnBroadcastsModel: {},
  contactsToTagsModel: {},
  contactModel: {},
  conversationModel: {},
  inboxModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    chatQueue: { add: vi.fn() },
    notificationQueue: { addBulk: vi.fn() },
  }
})

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: {
    conversationCreated: "conversationCreated",
    conversationUpdated: "conversationUpdated",
    conversationAssigned: "conversationAssigned",
  },
}))

// `conversationService` now imports `contactService` (for the location write
// inside `recordInboundActivity`), which pulls the analytics package into the
// import chain; its MAC tracking service reads `bloomFilter` off
// `@chatbotx.io/redis` at module scope. Stub analytics rather than partially
// mocking redis — matches the contact-service tests' convention.
vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitConversationArchived: vi.fn(),
  emitConversationAssigned: vi.fn(),
  emitConversationFollowUp: vi.fn(),
  emitConversationTransferredToBot: vi.fn(),
  emitConversationTransferredToHuman: vi.fn(),
  emitConversationUnassigned: vi.fn(),
}))

vi.mock("../../contact-inbox/service", () => ({
  contactInboxService: {},
}))

const { conversationService } = await import("../service")

const WORKSPACE_ID = "ws-1"

beforeEach(() => {
  mocks.conversationFindMany.mockReset()
  mocks.updateSet.mockReset()
  mocks.updateWhere.mockReset()
  mocks.updateReturning.mockReset()
  mocks.updateReturning.mockResolvedValue([])
})

describe("ConversationService.findDMByContactIds", () => {
  test("queries only DM conversations (sourceId IS NULL) scoped to the workspace", async () => {
    const rows = [
      { id: "conv-1", contactId: "contact-1" },
      { id: "conv-2", contactId: "contact-2" },
    ]
    mocks.conversationFindMany.mockResolvedValue(rows)

    const result = await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-2"],
    })

    expect(result).toEqual(rows)
    expect(mocks.conversationFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: WORKSPACE_ID,
        contactId: { in: ["contact-1", "contact-2"] },
        sourceId: { isNull: true },
      },
    })
  })

  test("deduplicates contactIds before querying", async () => {
    mocks.conversationFindMany.mockResolvedValue([])

    await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-1", "contact-2"],
    })

    expect(mocks.conversationFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: WORKSPACE_ID,
        contactId: { in: ["contact-1", "contact-2"] },
        sourceId: { isNull: true },
      },
    })
  })

  test("short-circuits with an empty result and no query when contactIds is empty", async () => {
    const result = await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: [],
    })

    expect(result).toEqual([])
    expect(mocks.conversationFindMany).not.toHaveBeenCalled()
  })

  test("queries non-null sourceId conversations for TikTok, whose DM is keyed by conversation_id", async () => {
    mocks.conversationFindMany.mockResolvedValue([])

    await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
      channel: "tiktok",
    })

    expect(mocks.conversationFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: WORKSPACE_ID,
        contactId: { in: ["contact-1"] },
        sourceId: { isNotNull: true },
      },
    })
  })

  test("keeps the null sourceId DM filter for non-TikTok channels", async () => {
    mocks.conversationFindMany.mockResolvedValue([])

    await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
      channel: "telegram",
    })

    expect(mocks.conversationFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: WORKSPACE_ID,
        contactId: { in: ["contact-1"] },
        sourceId: { isNull: true },
      },
    })
  })

  test("returns TikTok conversations as-is without post-processing", async () => {
    const rows = [
      { id: "1", contactId: "contact-1" },
      { id: "2", contactId: "contact-2" },
    ]
    mocks.conversationFindMany.mockResolvedValue(rows)

    const result = await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-2"],
      channel: "tiktok",
    })

    expect(result).toEqual(rows)
  })

  test("uses the provided transaction client instead of the default db", async () => {
    const txFindMany = vi.fn().mockResolvedValue([{ id: "conv-tx" }])
    const tx = {
      query: { conversationModel: { findMany: txFindMany } },
    } as unknown as Parameters<
      typeof conversationService.findDMByContactIds
    >[0]["tx"]

    const result = await conversationService.findDMByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1"],
      tx,
    })

    expect(result).toEqual([{ id: "conv-tx" }])
    expect(txFindMany).toHaveBeenCalledOnce()
    expect(mocks.conversationFindMany).not.toHaveBeenCalled()
  })
})

// `Conversation` carries two partial unique indexes — `Conversation_contactId_dm_key`
// on (contactId) WHERE sourceId IS NULL, and `Conversation_contactId_sourceId_key`
// otherwise — so a find-then-insert can lose the race to a concurrent writer.
describe("ConversationService.findOrCreate concurrent insert", () => {
  function buildTx(props: {
    findFirst: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }) {
    const onConflictDoNothing = vi.fn(() => ({ returning: props.returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    return {
      tx: {
        query: { conversationModel: { findFirst: props.findFirst } },
        insert,
      } as unknown as Parameters<
        typeof conversationService.findOrCreate
      >[0]["tx"],
      onConflictDoNothing,
    }
  }

  test("returns the row the concurrent writer created instead of throwing", async () => {
    const winner = { id: "conv-winner", contactId: "contact-1", sourceId: null }
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(winner)
    const { tx, onConflictDoNothing } = buildTx({
      findFirst,
      // ON CONFLICT DO NOTHING swallowed the insert.
      returning: vi.fn().mockResolvedValue([]),
    })

    const result = await conversationService.findOrCreate({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sourceId: null,
      tx,
    })

    expect(result).toEqual(winner)
    expect(onConflictDoNothing).toHaveBeenCalledOnce()
    expect(findFirst).toHaveBeenCalledTimes(2)
  })

  test("throws when the insert produced nothing and no row can be re-read", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const { tx } = buildTx({
      findFirst,
      returning: vi.fn().mockResolvedValue([]),
    })

    await expect(
      conversationService.findOrCreate({
        workspaceId: WORKSPACE_ID,
        contactId: "contact-1",
        sourceId: null,
        tx,
      }),
    ).rejects.toThrow("Conversation not found")
  })

  test("skips the insert entirely when the conversation already exists", async () => {
    const existing = { id: "conv-existing", contactId: "contact-1" }
    const findFirst = vi.fn().mockResolvedValue(existing)
    const returning = vi.fn()
    const { tx } = buildTx({ findFirst, returning })

    const result = await conversationService.findOrCreate({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sourceId: null,
      tx,
    })

    expect(result).toEqual(existing)
    expect(returning).not.toHaveBeenCalled()
  })
})

describe("ConversationService.updateAssignment", () => {
  test("scopes the update WHERE clause to the workspace, not just the conversation ids", async () => {
    // Regression test for a cross-tenant write: this method previously
    // built its WHERE as `inArray(id, ids)` only, unlike its siblings
    // `updateArchived`/`updateBotEnabled`, which both scope by workspaceId
    // too. A caller passing ids from another workspace would have updated
    // them. See packages/business/src/conversation/service.ts.
    await conversationService.updateAssignment({
      workspaceId: WORKSPACE_ID,
      conversations: [{ id: "conv-1", contactId: "contact-1" }],
      assignedUserId: "user-1",
      assignedInboxTeamId: null,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "test",
        triggerType: "conversation_assigned",
      },
    })

    expect(mocks.updateWhere).toHaveBeenCalledWith({
      and: [
        { eq: [undefined, WORKSPACE_ID] },
        { inArray: [undefined, ["conv-1"]] },
      ],
    })
  })
})
