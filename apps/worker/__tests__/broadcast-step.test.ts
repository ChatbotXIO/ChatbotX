import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const whereSpy = vi.fn<(...args: unknown[]) => unknown>()
const updateSpy = vi.fn<(table: unknown) => unknown>()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return {
            where: (...args: unknown[]) => {
              whereSpy(...args)
              return Promise.resolve()
            },
          }
        },
      }
    },
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  isNull: (column: unknown) => ({ __isNull: column }),
}))

// Do NOT importOriginal the real schema module here: its index pulls in the
// message sharding client, which opens a database connection at import time.
vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
    broadcastSubscribedAt: { __column: "broadcastSubscribedAt" },
  },
  contactCustomFieldModel: {},
  contactNoteModel: {},
  tagModel: {},
  // The rest below are never queried by this test's mocked db — they're
  // only referenced at module scope by the real (unmocked) contactVariableService
  // import chain in src/integration/handlers/contact.ts
  // (@chatbotx.io/variables -> @chatbotx.io/business/{contact,user-quota,
  // workspace-usage,inbox,...} -> @chatbotx.io/database/queries/contact-filter),
  // whose joinTableExists()/RELATION_SET_FILTERS/LiveCounterStore field
  // initializers eagerly read these columns at import time.
  contactsOnSequenceModel: {
    contactId: { __column: "contactId" },
    sequenceId: { __column: "sequenceId" },
  },
  contactsToTagsModel: {
    contactId: { __column: "contactId" },
    tagId: { __column: "tagId" },
  },
  conversationModel: {
    contactId: { __column: "contactId" },
    assignedUserId: { __column: "assignedUserId" },
    assignedInboxTeamId: { __column: "assignedInboxTeamId" },
    archivedAt: { __column: "archivedAt" },
    followed: { __column: "followed" },
    botEnabled: { __column: "botEnabled" },
    botResumeAt: { __column: "botResumeAt" },
    lastActivityAt: { __column: "lastActivityAt" },
    agentLastReadAt: { __column: "agentLastReadAt" },
  },
  contactInboxModel: {
    contactId: { __column: "contactId" },
    source: { __column: "source" },
    channel: { __column: "channel" },
    inboxId: { __column: "inboxId" },
    language: { __column: "language" },
    sourceId: { __column: "sourceId" },
    consecutiveFailedReply: { __column: "consecutiveFailedReply" },
    contactLastReadAt: { __column: "contactLastReadAt" },
    lastOutboundMessageAt: { __column: "lastOutboundMessageAt" },
    lastIncomingMessageAt: { __column: "lastIncomingMessageAt" },
    lastUserInput: { __column: "lastUserInput" },
    lastUserInputType: { __column: "lastUserInputType" },
  },
  contactsOnBroadcastsModel: {
    contactId: { __column: "contactId" },
    broadcastId: { __column: "broadcastId" },
    sent: { __column: "sent" },
    deliveredAt: { __column: "deliveredAt" },
    seenAt: { __column: "seenAt" },
    clickedAt: { __column: "clickedAt" },
    failedAt: { __column: "failedAt" },
  },
  couponModel: {
    issuedContactId: { __column: "issuedContactId" },
    workspaceId: { __column: "workspaceId" },
    topicId: { __column: "topicId" },
    usedAt: { __column: "usedAt" },
    code: { __column: "code" },
  },
  questionnaireModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
  questionnaireSubmissionModel: {
    contactId: { __column: "contactId" },
    questionnaireId: { __column: "questionnaireId" },
    workspaceId: { __column: "workspaceId" },
    status: { __column: "status" },
  },
  messageModel: {
    id: { __column: "id" },
    text: { __column: "text" },
  },
  inboxModel: {},
  userQuotaModel: {
    userId: { __column: "userId" },
    workspacesUsed: { __column: "workspacesUsed" },
    channelsUsed: { __column: "channelsUsed" },
    teamMembersUsed: { __column: "teamMembersUsed" },
    contactsUsed: { __column: "contactsUsed" },
    macUsed: { __column: "macUsed" },
    botMessagesUsed: { __column: "botMessagesUsed" },
    monthlyBotMessagesUsed: { __column: "monthlyBotMessagesUsed" },
  },
  workspaceUsageModel: {
    workspaceId: { __column: "workspaceId" },
    contactsUsed: { __column: "contactsUsed" },
    channelsUsed: { __column: "channelsUsed" },
    teamMembersUsed: { __column: "teamMembersUsed" },
    botMessagesUsed: { __column: "botMessagesUsed" },
    macUsed: { __column: "macUsed" },
  },
  ROOT_TENANT_ID: "1",
  // Referenced at module scope by @chatbotx.io/analytics' magic-link-stats
  // and ref-link-stats repositories (pulled in transitively) — plain column
  // refs, never queried by this test's mocked db.
  magicLinkStatModel: {
    workspaceId: { __column: "workspaceId" },
    linkId: { __column: "linkId" },
    contactInboxId: { __column: "contactInboxId" },
    occurredAt: { __column: "occurredAt" },
  },
  refLinkStatModel: {
    workspaceId: { __column: "workspaceId" },
    linkId: { __column: "linkId" },
    contactInboxId: { __column: "contactInboxId" },
    occurredAt: { __column: "occurredAt" },
    contactId: { __column: "contactId" },
  },
  // Referenced at module scope by contact-filter's relation-sets (pulled in
  // transitively) — plain column ref, never queried by this test's mocked db.
  adsConversionEventModel: {
    eventType: { __column: "eventType" },
  },
  // Referenced at module scope by ads-conversion/schema.ts (pulled in
  // transitively via the contactVariableService import chain).
  adsConversionRuleModel: {},
  createSelectSchema: (
    _table: unknown,
    refinements?: Record<string, unknown>,
  ) => z.object(refinements ?? {}),
  adsConversionChannelSchema: z.enum(["whatsapp", "facebook"]),
  adsConversionEventTypeSchema: z.enum(["lead", "purchase"]),
}))

vi.mock("@chatbotx.io/redis", () => ({
  // Never called by this test — only needed so the real (unmocked)
  // contactVariableService import chain's LiveCounterStore singletons
  // (user-quota/workspace-usage services) don't dial a real Redis at import
  // time.
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
  bloomFilter: {},
  cacheConnections: { useExisting: vi.fn(), create: vi.fn() },
  distributedStore: {},
  distributedSequenceStore: {},
  distributedLock: {
    runExclusive: vi.fn(async (_k: string, fn: () => unknown) => fn()),
  },
}))
vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
const emitContactUnsubscribed = vi.fn()
vi.mock("@chatbotx.io/events", () => ({
  emitContactUnsubscribed,
  emitCustomFieldChanged: vi.fn(),
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))
vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: vi.fn(),
  enrollContactInSequence: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
  // The rest below are never called by this test — only needed so the real
  // (unmocked) contactVariableService import chain (@chatbotx.io/variables)
  // resolves without throwing on missing exports.
  contactService: { delete: vi.fn() },
  contactCustomFieldService: {
    setValueByKey: vi.fn(),
    deleteByKey: vi.fn(),
  },
  workspaceService: { find: vi.fn(), findById: vi.fn() },
  couponService: { resolveCouponVariable: vi.fn() },
  conversationService: {
    findDMByContact: vi.fn(),
    findBy: vi.fn(),
    findLatestByContact: vi.fn(),
    findByUncached: vi.fn(),
  },
  messageService: {
    findById: vi.fn(),
    listLastMessages: vi.fn(),
    listIncomingTextsByContactInbox: vi.fn(),
    findLatestIncomingMessageWithAttachments: vi.fn(),
    hardDeleteAllByContactInbox: vi.fn(),
  },
  workspaceMemberService: {
    findWithUserByWorkspaceIdAndUserId: vi.fn(),
  },
  contactInboxService: {
    findRecentByContactId: vi.fn(),
    findByUncached: vi.fn(),
  },
  contactNoteService: { listByContactId: vi.fn() },
  tagService: { listByContactId: vi.fn() },
  inboxService: { findWithIntegrationsById: vi.fn() },
  resolveTenantSettings: vi.fn(),
  resolveWorkspaceAppUrl: vi.fn(),
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "test-id",
  }
})

// Imported once at module level: the handlers chain is heavy to transform,
// and paying it inside a test body can exceed the 5s timeout under load.
const { subscribeBroadcast, unsubscribeBroadcast } = await import(
  "../src/integration/handlers/contact"
)

const buildProps = () =>
  ({
    conversation: {
      contactId: "contact-1",
      workspaceId: "workspace-1",
    },
    step: {},
  }) as unknown as Parameters<
    typeof import("../src/integration/handlers/contact").subscribeBroadcast
  >[0]

beforeEach(() => {
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  emitContactUnsubscribed.mockClear()
})

describe("subscribeBroadcast", () => {
  test("sets broadcastSubscribedAt to current Date scoped by contact + workspace", async () => {
    const before = Date.now()
    await subscribeBroadcast(buildProps())
    const after = Date.now()

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(whereSpy).toHaveBeenCalledTimes(1)

    const setCall = setSpy.mock.calls[0][0]
    expect(setCall.broadcastSubscribedAt).toBeInstanceOf(Date)
    const ts = (setCall.broadcastSubscribedAt as Date).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)

    const whereArg = whereSpy.mock.calls[0][0] as { __and: unknown[] }
    expect(whereArg.__and).toHaveLength(3)
  })

  test("is idempotent — WHERE includes isNull guard to preserve original subscription date", async () => {
    await subscribeBroadcast(buildProps())

    const whereArg = whereSpy.mock.calls[0][0] as {
      __and: Array<{ __isNull?: unknown }>
    }
    const hasIsNullGuard = whereArg.__and.some((c) => "__isNull" in c)
    expect(hasIsNullGuard).toBe(true)
  })
})

describe("unsubscribeBroadcast", () => {
  test("sets broadcastSubscribedAt to null scoped by contact + workspace", async () => {
    await unsubscribeBroadcast(buildProps())

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(whereSpy).toHaveBeenCalledTimes(1)

    const setCall = setSpy.mock.calls[0][0]
    expect(setCall.broadcastSubscribedAt).toBeNull()

    const whereArg = whereSpy.mock.calls[0][0] as { __and: unknown[] }
    expect(whereArg.__and).toHaveLength(2)
    expect(emitContactUnsubscribed).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
    )
  })
})
