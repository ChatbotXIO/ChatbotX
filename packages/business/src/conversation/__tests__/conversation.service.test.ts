import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindMany: vi.fn(),
  conversationFindFirst: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  findLastByConversation: vi.fn(),
  createMessageRepository: vi.fn(),
  getSafeSinceTime: vi.fn(
    (value: Date | undefined) => value as Date | undefined,
  ),
  findByWorkspaceIdAndUserId: vi.fn(),
  findInboxTeamByIdOrFail: vi.fn(),
  inboxTeamExists: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findMany: mocks.conversationFindMany,
        findFirst: mocks.conversationFindFirst,
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
  // Identity passthrough: just calls the loader, so `findByOrFail`/`findBy`
  // hit `conversationFindFirst` directly without exercising real caching.
  withCache: vi.fn((_key: string, loader: () => unknown) => loader()),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
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

vi.mock("../../workspace-member/service", () => ({
  workspaceMemberService: {
    findByWorkspaceIdAndUserId: mocks.findByWorkspaceIdAndUserId,
  },
}))

vi.mock("../../enterprise/inbox-team/service", () => ({
  inboxTeamService: {
    findByIdOrFail: mocks.findInboxTeamByIdOrFail,
    exists: mocks.inboxTeamExists,
  },
}))

const { conversationService } = await import("../service")
const { emit } = await import("@chatbotx.io/event-bus")

const WORKSPACE_ID = "ws-1"

beforeEach(() => {
  mocks.conversationFindMany.mockReset()
  mocks.conversationFindFirst.mockReset()
  mocks.updateSet.mockReset()
  mocks.updateWhere.mockReset()
  mocks.updateReturning.mockReset()
  mocks.updateReturning.mockResolvedValue([])
  mocks.findLastByConversation.mockReset()
  mocks.findLastByConversation.mockResolvedValue([])
  mocks.createMessageRepository.mockReset()
  mocks.createMessageRepository.mockResolvedValue({
    findLastByConversation: mocks.findLastByConversation,
  })
  mocks.getSafeSinceTime.mockReset()
  mocks.getSafeSinceTime.mockImplementation((value: Date | undefined) => value)
  mocks.findByWorkspaceIdAndUserId.mockReset()
  mocks.findInboxTeamByIdOrFail.mockReset()
  mocks.inboxTeamExists.mockReset()
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

describe("ConversationService.markUnread sinceTime anchor", () => {
  test("anchors sinceTime on the conversation's own lastActivityAt, not a shared contactInbox anchor", async () => {
    // Two conversations for the same contact could share one ContactInbox
    // (its lastMessageAt would reflect whichever was most recently active —
    // irrelevant here since the fix no longer reads it at all). This
    // conversation is the older, less-active one.
    const olderCommentConversation = {
      id: "conv-comment",
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    }
    mocks.conversationFindFirst.mockResolvedValue(olderCommentConversation)

    await conversationService.markUnread({
      workspaceId: WORKSPACE_ID,
      id: "conv-comment",
    })

    expect(mocks.findLastByConversation).toHaveBeenCalledWith(
      "conv-comment",
      expect.objectContaining({
        sinceTime: olderCommentConversation.lastActivityAt,
      }),
    )
  })

  test("falls back to the conversation's createdAt when lastActivityAt is unset", async () => {
    const conversation = {
      id: "conv-new",
      workspaceId: WORKSPACE_ID,
      contactId: "contact-2",
      lastActivityAt: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    }
    mocks.conversationFindFirst.mockResolvedValue(conversation)

    await conversationService.markUnread({
      workspaceId: WORKSPACE_ID,
      id: "conv-new",
    })

    expect(mocks.findLastByConversation).toHaveBeenCalledWith(
      "conv-new",
      expect.objectContaining({
        sinceTime: conversation.createdAt,
      }),
    )
  })

  test("marks the second-to-last incoming message as the new read boundary", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    }
    mocks.conversationFindFirst.mockResolvedValue(conversation)
    mocks.findLastByConversation.mockResolvedValue([
      { createdAt: new Date("2026-01-01T00:05:00Z") },
      { createdAt: new Date("2026-01-01T00:00:00Z") },
    ])

    const result = await conversationService.markUnread({
      workspaceId: WORKSPACE_ID,
      id: "conv-1",
    })

    expect(result.agentLastReadAt).toEqual(new Date("2026-01-01T00:00:00Z"))
    expect(mocks.updateWhere).toHaveBeenCalled()
    expect(mocks.updateSet).toHaveBeenCalledWith({
      agentLastReadAt: new Date("2026-01-01T00:00:00Z"),
    })
  })
})

describe("ConversationService.resolveAssignmentTarget (via assignByContactIds)", () => {
  test("throws invalidAssignee when the u_ prefixed user is not a workspace member", async () => {
    mocks.findByWorkspaceIdAndUserId.mockResolvedValue(undefined)

    await expect(
      conversationService.assignByContactIds({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-1"],
        assignedId: "u_unknown-user",
        triggerContext: { triggerSource: "api", triggerHandler: "test" },
      }),
    ).rejects.toMatchObject({ code: "invalidAssignee" })

    expect(mocks.conversationFindMany).not.toHaveBeenCalled()
  })

  test("throws invalidAssignee when the t_ prefixed team does not exist", async () => {
    mocks.findInboxTeamByIdOrFail.mockRejectedValue(
      new Error("Inbox team not found"),
    )

    await expect(
      conversationService.assignByContactIds({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-1"],
        assignedId: "t_unknown-team",
        triggerContext: { triggerSource: "api", triggerHandler: "test" },
      }),
    ).rejects.toThrow("Inbox team not found")
  })

  test("throws invalidAssignee on an unrecognized prefix", async () => {
    await expect(
      conversationService.assignByContactIds({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-1"],
        assignedId: "bogus-assignee",
        triggerContext: { triggerSource: "api", triggerHandler: "test" },
      }),
    ).rejects.toMatchObject({ code: "invalidAssignee" })
  })

  test("validates the assignee before short-circuiting on no matching conversations", async () => {
    mocks.conversationFindMany.mockResolvedValue([])

    await expect(
      conversationService.assignByContactIds({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-none"],
        assignedId: "u_unknown-user",
        triggerContext: { triggerSource: "api", triggerHandler: "test" },
      }),
    ).rejects.toMatchObject({ code: "invalidAssignee" })

    // resolveAssignmentTarget ran (and threw) before findManyByContactIds
    // would have been reached.
    expect(mocks.conversationFindMany).not.toHaveBeenCalled()
  })

  test("early-returns without updating when no conversations match the contact ids", async () => {
    mocks.findByWorkspaceIdAndUserId.mockResolvedValue({
      userId: "user-1",
      workspaceId: WORKSPACE_ID,
    })
    mocks.conversationFindMany.mockResolvedValue([])

    await conversationService.assignByContactIds({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-none"],
      assignedId: "u_user-1",
      triggerContext: { triggerSource: "api", triggerHandler: "test" },
    })

    expect(mocks.updateWhere).not.toHaveBeenCalled()
  })
})

// Worker trigger-action/flow-step variant: a stale or invalid assignedId
// must silently no-op, matching the pre-existing behavior of
// `stepAssignConversation`/`ActionExecutor`'s assignConversation case — a
// single bad id in a flow/trigger must not hard-fail the whole run.
describe("ConversationService.assignOneOrSkip", () => {
  const conversation = { id: "conv-1", contactId: "contact-1" }

  test("silently does nothing when the u_ prefixed user is not a workspace member", async () => {
    mocks.findByWorkspaceIdAndUserId.mockResolvedValue(undefined)

    await conversationService.assignOneOrSkip({
      workspaceId: WORKSPACE_ID,
      conversation,
      assignedId: "u_unknown-user",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "test",
        triggerType: "trigger_action",
      },
    })

    expect(mocks.updateWhere).not.toHaveBeenCalled()
  })

  test("silently does nothing when the t_ prefixed team does not exist", async () => {
    mocks.inboxTeamExists.mockResolvedValue(false)

    await conversationService.assignOneOrSkip({
      workspaceId: WORKSPACE_ID,
      conversation,
      assignedId: "t_unknown-team",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "test",
        triggerType: "trigger_action",
      },
    })

    expect(mocks.updateWhere).not.toHaveBeenCalled()
  })

  test("silently does nothing on an unrecognized prefix", async () => {
    await conversationService.assignOneOrSkip({
      workspaceId: WORKSPACE_ID,
      conversation,
      assignedId: "bogus-assignee",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "test",
        triggerType: "trigger_action",
      },
    })

    expect(mocks.updateWhere).not.toHaveBeenCalled()
  })

  test("assigns the conversation when the u_ prefixed user is a valid workspace member", async () => {
    mocks.findByWorkspaceIdAndUserId.mockResolvedValue({
      userId: "user-1",
      workspaceId: WORKSPACE_ID,
    })

    await conversationService.assignOneOrSkip({
      workspaceId: WORKSPACE_ID,
      conversation,
      assignedId: "u_user-1",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "test",
        triggerType: "trigger_action",
      },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      assignedUserId: "user-1",
      assignedInboxTeamId: null,
    })
  })

  // Regression: `assignOneOrSkip` must forward the caller's own
  // `triggerType` ("trigger_action"/"flow_action" — how the assignment
  // fired) into the analytics event untouched, not overwrite it with the
  // "conversation_assigned"/"unassigned" value `assignByContactIds`/
  // `assignOne` derive for the API's DB-event taxonomy — those are two
  // different axes that happen to share the `triggerType` field name.
  test("forwards the caller's triggerType into the analytics event unchanged", async () => {
    mocks.findByWorkspaceIdAndUserId.mockResolvedValue({
      userId: "user-1",
      workspaceId: WORKSPACE_ID,
    })

    await conversationService.assignOneOrSkip({
      workspaceId: WORKSPACE_ID,
      conversation,
      assignedId: "u_user-1",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "actionExecutor.assignConversation",
        triggerType: "trigger_action",
      },
    })

    expect(emit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "actionExecutor.assignConversation",
            triggerType: "trigger_action",
          },
        },
      }),
    )
  })
})
