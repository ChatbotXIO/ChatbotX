import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findMany: mocks.conversationFindMany,
      },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conversationModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
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
