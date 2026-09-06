import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `coexistImportService.resolveOrCreateContactLinks` is the Coexist historical
// import's phase-1 transaction, moved verbatim out of the worker handler
// (`apps/worker/src/integration/handlers/coexist/bulk-historical-import.ts`)
// when direct `db.*` access was removed from `apps/worker`.
//
// The worker-level test can no longer see inside the transaction, so the
// invariants that used to be asserted there live here now:
//
//   * The ContactInbox insert's `onConflictDoNothing()` stays UNTARGETED. A
//     concurrent import can win EITHER identity index — (inboxId, sourceId) or
//     the partial (inboxId, sourceUserId) — and a targeted clause would let the
//     second one abort the whole batch.
//   * Rows that lost the insert race are re-SELECTed by sourceId, and rows
//     skipped on the partial scoped-user-id index are resolved through the
//     winner owning that scoped id and then ALIASED back to the raced entry's
//     own import key (message import is keyed by the entry's sourceId).
//   * Pre-allocated Contact rows for raced entries are deleted, and
//     `importedContacts` counts only the truly-new rows — not the raced ones.
//   * Orphan conversations (existing ContactInbox + Contact, missing
//     Conversation) are healed so no caller ever receives an empty
//     conversationId.
//
// The schema module is stubbed with plain objects — importing the real schema
// opens a database connection through the sharding client.
// ---------------------------------------------------------------------------

const { mockTransaction, mockCancelByInboxSource } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockCancelByInboxSource: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: { transaction: mockTransaction },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    __inArray: [column, values],
  })),
  or: vi.fn((...args: unknown[]) => ({ __or: args })),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  contactSources: { enum: { inboundMessage: "inboundMessage" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "ci.id",
    inboxId: "ci.inboxId",
    sourceId: "ci.sourceId",
    sourceUserId: "ci.sourceUserId",
    contactId: "ci.contactId",
  },
  contactModel: { id: "contact.id" },
  conversationModel: { id: "conv.id", contactId: "conv.contactId" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("../src/message-cleanup/service", () => ({
  messageCleanupService: { cancelByInboxSource: mockCancelByInboxSource },
}))

let idSeq = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => {
    idSeq += 1
    return `id-${idSeq}`
  },
}))

const { coexistImportService } = await import("../src/coexist-import/service")

/**
 * A recording transaction stub. `selectResults` is drained in call order —
 * the method issues its SELECTs in a fixed sequence, so the queue models the
 * database's answers turn by turn.
 */
const buildTx = (selectResults: unknown[][]) => {
  const calls = {
    conversationInsertValues: [] as unknown[][],
    contactInboxInsertValues: [] as unknown[][],
    contactInsertValues: [] as unknown[][],
    deletedContacts: [] as unknown[],
    onConflictDoNothingArgs: [] as unknown[],
  }
  const queue = [...selectResults]
  const inboxReturning = { rows: [] as unknown[] }

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(queue.shift() ?? [])),
    })),
  }))

  const insert = vi.fn((model: { id?: string }) => ({
    values: vi.fn((rows: unknown[]) => {
      if (model.id === "contact.id") {
        calls.contactInsertValues.push(rows)
        return Promise.resolve(undefined)
      }
      if (model.id === "ci.id") {
        calls.contactInboxInsertValues.push(rows)
        return {
          onConflictDoNothing: vi.fn((...args: unknown[]) => {
            calls.onConflictDoNothingArgs.push(args)
            return {
              returning: vi.fn(() => Promise.resolve([...inboxReturning.rows])),
            }
          }),
        }
      }
      calls.conversationInsertValues.push(rows)
      return {
        onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
      }
    }),
  }))

  const del = vi.fn(() => ({
    where: vi.fn((clause: unknown) => {
      calls.deletedContacts.push(clause)
      return Promise.resolve(undefined)
    }),
  }))

  return {
    calls,
    inboxReturning,
    tx: { select, insert, delete: del },
  }
}

const run = async (
  fixture: ReturnType<typeof buildTx>,
  input: Parameters<typeof coexistImportService.resolveOrCreateContactLinks>[0],
) => {
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => await fn(fixture.tx),
  )
  return await coexistImportService.resolveOrCreateContactLinks(input)
}

beforeEach(() => {
  vi.clearAllMocks()
  idSeq = 0
  mockCancelByInboxSource.mockResolvedValue(undefined)
})

describe("coexistImportService.resolveOrCreateContactLinks", () => {
  test("the ContactInbox insert's onConflictDoNothing() stays UNTARGETED", async () => {
    const fixture = buildTx([
      [], // no existing ContactInbox rows
      [{ id: "conv-1", contactId: "id-1" }], // conversations for inserted rows
    ])
    fixture.inboxReturning.rows = [
      { id: "ci-1", sourceId: "s1", contactId: "id-1" },
    ]

    await run(fixture, {
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      inboxChannel: "whatsapp",
      dedup: new Map([["s1", { sourceId: "s1", firstName: "A" }]]),
      sourceIds: ["s1"],
      sourceUserIds: [],
    })

    expect(fixture.calls.onConflictDoNothingArgs).toHaveLength(1)
    // A targeted clause would let a conflict on the OTHER identity index
    // abort the whole batch, so the call must carry no arguments at all.
    expect(fixture.calls.onConflictDoNothingArgs[0]).toEqual([])
  })

  test("counts only truly-new rows and deletes the pre-allocated Contact of a raced entry", async () => {
    const fixture = buildTx([
      [], // no existing ContactInbox rows
      [{ id: "ci-won", sourceId: "s2", contactId: "contact-won" }], // race winners by sourceId
      [
        { id: "ci-1", contactId: "id-1" },
        { id: "ci-won", contactId: "contact-won" },
      ], // conversations for accepted contacts
    ])
    // Only s1 inserted; s2 lost the race.
    fixture.inboxReturning.rows = [
      { id: "ci-1", sourceId: "s1", contactId: "id-1" },
    ]

    const result = await run(fixture, {
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      inboxChannel: "whatsapp",
      dedup: new Map([
        ["s1", { sourceId: "s1" }],
        ["s2", { sourceId: "s2" }],
      ]),
      sourceIds: ["s1", "s2"],
      sourceUserIds: [],
    })

    // 2 attempted - 1 raced = 1 truly new.
    expect(result.importedContacts).toBe(1)
    // The Contact row pre-allocated for the raced s2 is deleted.
    expect(fixture.calls.deletedContacts).toHaveLength(1)
    // Both source ids still resolve to a link, so message import can proceed.
    expect(result.contactInboxIds.get("s1")?.contactId).toBe("id-1")
    expect(result.contactInboxIds.get("s2")?.contactId).toBe("contact-won")
    // The event fan-out covers everything resolved through the insert path.
    expect(
      result.newContactCreatedEvents.map((e) => e.sourceId).sort(),
    ).toEqual(["s1", "s2"])
  })

  test("aliases a scoped-user-id race winner back to the raced entry's own import key", async () => {
    const fixture = buildTx([
      [], // no existing ContactInbox rows
      [], // no winner under s-new's own sourceId
      // the row that already owns scoped user id "u-9", under a DIFFERENT sourceId
      [
        {
          id: "ci-owner",
          sourceId: "s-owner",
          sourceUserId: "u-9",
          contactId: "contact-owner",
        },
      ],
      [{ id: "conv-owner", contactId: "contact-owner" }], // conversations
    ])
    fixture.inboxReturning.rows = [] // the insert was skipped entirely

    const result = await run(fixture, {
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      inboxChannel: "whatsapp",
      dedup: new Map([["s-new", { sourceId: "s-new", sourceUserId: "u-9" }]]),
      sourceIds: ["s-new"],
      sourceUserIds: ["u-9"],
    })

    // Resolved under the winner's own sourceId...
    expect(result.contactInboxIds.get("s-owner")).toEqual({
      contactInboxId: "ci-owner",
      contactId: "contact-owner",
      conversationId: "conv-owner",
    })
    // ...AND aliased to the raced entry's import key, so downstream message
    // import keyed on "s-new" still finds its contact.
    expect(result.contactInboxIds.get("s-new")).toEqual(
      result.contactInboxIds.get("s-owner"),
    )
    expect(result.importedContacts).toBe(0)
  })

  test("heals an orphan conversation so no link is returned with an empty conversationId", async () => {
    const fixture = buildTx([
      // an existing ContactInbox with no Conversation
      [
        {
          id: "ci-1",
          sourceId: "s1",
          sourceUserId: null,
          contactId: "contact-1",
        },
      ],
      [], // no conversations for that contact → orphan
      [{ id: "conv-healed", contactId: "contact-1" }], // read back after the heal insert
    ])

    const result = await run(fixture, {
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      inboxChannel: "whatsapp",
      dedup: new Map([["s1", { sourceId: "s1" }]]),
      sourceIds: ["s1"],
      sourceUserIds: [],
    })

    expect(fixture.calls.conversationInsertValues).toHaveLength(1)
    expect(result.contactInboxIds.get("s1")).toEqual({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      conversationId: "conv-healed",
    })
    // Nothing was newly imported — the row already existed.
    expect(result.importedContacts).toBe(0)
    expect(result.newContactCreatedEvents).toEqual([])
  })

  test("cancels pending message cleanup for every resolved inbox identity", async () => {
    const fixture = buildTx([[], [{ id: "conv-1", contactId: "id-1" }]])
    fixture.inboxReturning.rows = [
      { id: "ci-1", sourceId: "s1", contactId: "id-1" },
    ]

    await run(fixture, {
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      inboxChannel: "whatsapp",
      dedup: new Map([["s1", { sourceId: "s1" }]]),
      sourceIds: ["s1"],
      sourceUserIds: [],
    })

    // Re-created contacts keep their history.
    expect(mockCancelByInboxSource).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceIds: ["s1"],
      tx: fixture.tx,
    })
  })
})
