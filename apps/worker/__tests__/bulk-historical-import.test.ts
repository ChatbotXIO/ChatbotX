import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mocks — the bulk pipeline calls many DB primitives we must stub:
// transaction() runs the callback inline against a fake `tx` object that
// exposes select(), insert(), update(), delete(), and execute().
// ---------------------------------------------------------------------------

const {
  mockTransaction,
  mockTxSelect,
  mockTxInsert,
  mockTxUpdate,
  mockTxDelete,
  mockTxExecute,
  mockDbUpdate,
  mockEmitContactCreated,
  mockEmit,
  mockCreateId,
  mockBulkCreate,
  mockCreateMessageRepository,
} = vi.hoisted(() => {
  const mockBulkCreate = vi.fn().mockResolvedValue([])
  const mockBulkCreateAttachments = vi.fn().mockResolvedValue([])
  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    bulkCreate: mockBulkCreate,
    bulkCreateAttachments: mockBulkCreateAttachments,
  })
  return {
    mockTransaction: vi.fn(),
    mockTxSelect: vi.fn(),
    mockTxInsert: vi.fn(),
    mockTxUpdate: vi.fn(),
    mockTxDelete: vi.fn(),
    mockTxExecute: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockEmitContactCreated: vi.fn(() => Promise.resolve()),
    mockEmit: vi.fn(() => Promise.resolve()),
    mockCreateId: vi.fn(),
    mockBulkCreate,
    mockCreateMessageRepository,
  }
})

vi.mock("@chatbotx.io/database/client", () => {
  const tx = {
    select: mockTxSelect,
    insert: mockTxInsert,
    update: mockTxUpdate,
    delete: mockTxDelete,
    execute: mockTxExecute,
  }
  mockTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
  // db.update() is used best-effort outside transactions (lastMessageAt bump).
  // Return a chainable stub so it never throws.
  mockDbUpdate.mockImplementation(() => {
    const chain = { set: vi.fn(), where: vi.fn() }
    chain.set.mockReturnValue(chain)
    chain.where.mockResolvedValue(undefined)
    return chain
  })
  return {
    db: {
      transaction: mockTransaction,
      update: mockDbUpdate,
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
    inArray: vi.fn((col: unknown, vals: unknown) => ({
      __inArray: [col, vals],
    })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ..._args: unknown[]) => ({
        __sql: strings.raw,
      }),
      {
        raw: (s: string) => s,
        join: (chunks: unknown[], _sep?: unknown) => ({ __join: chunks }),
      },
    ),
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  attachmentModel: { id: "att_id" },
  contactInboxModel: {
    id: "ci_id",
    sourceId: "ci_sourceId",
    contactId: "ci_contactId",
    inboxId: "ci_inboxId",
  },
  contactModel: { id: "c_id" },
  conversationModel: { id: "conv_id", contactId: "conv_contactId" },
  messageModel: {
    id: "m_id",
    contactInboxId: "m_ci",
    sourceId: "m_sid",
    $inferInsert: {},
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: mockCreateId }))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { bulkImportHistorical } from "../src/integration/handlers/coexist/bulk-historical-import"

// ---------------------------------------------------------------------------
// Helpers — chain builders mirroring Drizzle's fluent API
// ---------------------------------------------------------------------------

type SelectStubConfig = {
  /** Rows returned by .where() for SELECTs without .limit(), or by .limit() otherwise. */
  rows?: unknown[]
  /** Set to true when production code chains .limit(n) after .where(). */
  hasLimit?: boolean
}

/** Stub a single tx.select(...).from(...).where(...)[.limit()] chain returning `rows`. */
const enqueueSelect = (config: SelectStubConfig = {}) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  if (config.hasLimit) {
    // .where() returns the chain for further chaining; .limit() resolves
    chain.where.mockReturnValue(chain)
    chain.limit.mockResolvedValue(config.rows ?? [])
  } else {
    chain.where.mockResolvedValue(config.rows ?? [])
  }
  mockTxSelect.mockReturnValueOnce(chain)
  return chain
}

type InsertStubConfig = {
  returningRows?: unknown[]
}

/**
 * Stub tx.insert(...).values(...) which may be terminal, or chain
 * .onConflictDoNothing().returning() / .onConflictDoUpdate() / .returning().
 */
const enqueueInsert = (config: InsertStubConfig = {}) => {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
  }
  chain.values.mockReturnValue(chain)
  chain.onConflictDoNothing.mockReturnValue(chain)
  chain.onConflictDoUpdate.mockResolvedValue(undefined)
  chain.returning.mockResolvedValue(config.returningRows ?? [])
  mockTxInsert.mockReturnValueOnce(chain)
  return chain
}

/**
 * Stub tx.insert(...).values(...).onConflictDoNothing(...) where the chain is
 * AWAITED directly without .returning() (e.g. the Conversation insert).
 */
const enqueueInsertNoReturning = () => {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  }
  chain.values.mockReturnValue(chain)
  chain.onConflictDoNothing.mockResolvedValue(undefined)
  chain.returning.mockResolvedValue([])
  mockTxInsert.mockReturnValueOnce(chain)
  return chain
}

/** Stub tx.update(...).set(...).where(...) — awaitable at .where(). */
const _enqueueUpdate = () => {
  const chain = { set: vi.fn(), where: vi.fn() }
  chain.set.mockReturnValue(chain)
  chain.where.mockResolvedValue(undefined)
  mockTxUpdate.mockReturnValueOnce(chain)
  return chain
}

/** Stub tx.delete(...).where(...). */
const _enqueueDelete = () => {
  const chain = { where: vi.fn() }
  chain.where.mockResolvedValue(undefined)
  mockTxDelete.mockReturnValueOnce(chain)
  return chain
}

const inbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "messenger",
} as never

const workspaceId = "ws-1"

const contact = (
  sourceId: string,
  overrides: Record<string, unknown> = {},
) => ({
  sourceId,
  firstName: "Bob",
  email: "bob@example.com",
  ...overrides,
})

const msg = (sourceId: string, overrides: Record<string, unknown> = {}) => ({
  sourceId,
  messageType: "incoming" as const,
  contentType: "text" as const,
  text: "hi",
  ...overrides,
})

// ---------------------------------------------------------------------------
// Helpers — stub a "new contacts" happy path inside bulkImportContacts tx.
// Sequence (when trulyNew > 0, no race):
//   1. SELECT existing ContactInbox rows          → enqueueSelect({ rows: [] })
//   2. INSERT Contact (terminal, no .returning()) → enqueueInsert()
//   3. INSERT ContactInbox .returning()           → enqueueInsert({ returningRows })
//   4. INSERT Conversation .onConflictDoNothing() → enqueueInsertNoReturning()
//   5. SELECT conversations for new contacts      → enqueueSelect({ rows })
// ---------------------------------------------------------------------------

type NewContactStub = {
  sourceId: string
  contactId: string
  contactInboxId: string
  conversationId: string
}

const stubNewContactsTransaction = (contacts: NewContactStub[]) => {
  // 1. SELECT existing ContactInbox → none
  enqueueSelect({ rows: [] })
  // 2. INSERT Contact (terminal)
  enqueueInsert({ returningRows: contacts.map((c) => ({ id: c.contactId })) })
  // 3. INSERT ContactInbox .returning()
  enqueueInsert({
    returningRows: contacts.map((c) => ({
      id: c.contactInboxId,
      sourceId: c.sourceId,
      contactId: c.contactId,
    })),
  })
  // 4. INSERT Conversation .onConflictDoNothing()
  enqueueInsertNoReturning()
  // 5. SELECT conversations for new contacts
  enqueueSelect({
    rows: contacts.map((c) => ({
      id: c.conversationId,
      contactId: c.contactId,
    })),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkImportHistorical", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let idCounter = 0
    mockCreateId.mockImplementation(() => `id-${++idCounter}`)
    // Re-wire transaction default after clearAllMocks resets it.
    const tx = {
      select: mockTxSelect,
      insert: mockTxInsert,
      update: mockTxUpdate,
      delete: mockTxDelete,
      execute: mockTxExecute,
    }
    mockTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx))
    // Re-wire db.update default after clearAllMocks.
    mockDbUpdate.mockImplementation(() => {
      const chain = { set: vi.fn(), where: vi.fn() }
      chain.set.mockReturnValue(chain)
      chain.where.mockResolvedValue(undefined)
      return chain
    })
    // Re-wire repository mock after clearAllMocks.
    mockBulkCreate.mockResolvedValue([])
    mockCreateMessageRepository.mockResolvedValue({
      bulkCreate: mockBulkCreate,
      bulkCreateAttachments: vi.fn().mockResolvedValue([]),
    })
  })

  it("empty batch returns zero counts without opening a transaction", async () => {
    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [],
    })

    expect(result).toEqual({
      importedContacts: 0,
      importedMessages: 0,
      skippedContacts: 0,
      skippedMessages: 0,
      failedMessages: 0,
      contactInboxIds: new Map(),
      insertedAttachmentIds: [],
      failureReason: undefined,
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("inserts new contact + messages when no existing ContactInbox matches", async () => {
    stubNewContactsTransaction([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    // bulkImportMessages: repository.bulkCreate() now handles message inserts
    mockBulkCreate.mockResolvedValueOnce([{ id: "m-1", sourceId: "m-src-1" }])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [{ contact: contact("src-1"), messages: [msg("m-src-1")] }],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.importedMessages).toBe(1)
    expect(result.skippedContacts).toBe(0)
    expect(result.failedMessages).toBe(0)
    expect(result.contactInboxIds.get("src-1")).toBe("ci-1")
  })

  it("counts duplicates as skippedMessages when message INSERT returns fewer rows than input", async () => {
    stubNewContactsTransaction([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    // 3 messages in, only 1 inserted → 2 duplicates
    mockBulkCreate.mockResolvedValueOnce([{ id: "m-1", sourceId: "m-1" }])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        {
          contact: contact("src-1"),
          messages: [msg("m-1"), msg("m-2"), msg("m-3")],
        },
      ],
    })

    expect(result.importedMessages).toBe(1)
    expect(result.skippedMessages).toBe(2)
  })

  it("uses existing ContactInbox row for already-known sourceId (idempotent re-run)", async () => {
    // existing row present
    enqueueSelect({
      rows: [{ id: "ci-existing", sourceId: "src-1", contactId: "c-existing" }],
    })
    // conversations lookup for existing contact ids
    enqueueSelect({
      rows: [{ id: "conv-existing", contactId: "c-existing" }],
    })
    // No new contacts → skips cap check, contact insert, etc.
    // Goes straight to repository.bulkCreate() for messages.
    mockBulkCreate.mockResolvedValueOnce([])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-1"), messages: [msg("m-1"), msg("m-2")] },
      ],
    })

    expect(result.importedContacts).toBe(0)
    expect(result.skippedContacts).toBe(0)
    expect(result.importedMessages).toBe(0)
    expect(result.skippedMessages).toBe(2)
    expect(result.contactInboxIds.get("src-1")).toBe("ci-existing")
  })

  it("dedups batch entries that share the same sourceId (merges messages)", async () => {
    stubNewContactsTransaction([
      {
        sourceId: "src-shared",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([
      { id: "m-1", sourceId: "m-a" },
      { id: "m-2", sourceId: "m-b" },
    ])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        { contact: contact("src-shared"), messages: [msg("m-a")] },
        { contact: contact("src-shared"), messages: [msg("m-b")] },
      ],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.importedMessages).toBe(2)
    expect(result.contactInboxIds.size).toBe(1)
  })

  // -------------------------------------------------------------------------
  // H7 — racedSourceIds O(n²) → O(n) via Set
  // -------------------------------------------------------------------------

  it("H7: racedSourceIds lookup produces correct results with many contacts (Set semantics)", async () => {
    // Build a scenario where ALL inserted ContactInbox rows "lose the race"
    // (the production code considers sourceIds not in insertedSourceIds as
    // raced). We do this by making insertedInboxes return an EMPTY array for
    // ContactInbox INSERT — so every sourceId is in racedSourceIds — then
    // stub the winner re-SELECT to return the real rows.
    //
    // With N = 50 contacts this exercises the O(n) path without being slow.
    const N = 50
    const contacts = Array.from({ length: N }, (_, i) => ({
      sourceId: `src-${i}`,
      contactId: `cid-${i}`,
      contactInboxId: `ci-${i}`,
      conversationId: `conv-${i}`,
    }))

    // 1. SELECT existing ContactInbox → none (all are new)
    enqueueSelect({ rows: [] })
    // 2. INSERT Contact (terminal)
    enqueueInsert({ returningRows: contacts.map((c) => ({ id: c.contactId })) })
    // 3. INSERT ContactInbox — returns EMPTY → ALL sourceIds go to racedSourceIds
    enqueueInsert({ returningRows: [] })
    // 4. Race-winner re-SELECT returns all contacts as winners
    enqueueSelect({
      rows: contacts.map((c) => ({
        id: c.contactInboxId,
        sourceId: c.sourceId,
        contactId: c.contactId,
      })),
    })
    // 5. DELETE orphan contacts (racedSourceIds.length > 0)
    _enqueueDelete()
    // 6. INSERT Conversation — skipped because all raced (conversationsToInsert = [])
    // 7. SELECT conversations for accepted contacts (via inArray on acceptedContactIds)
    enqueueSelect({
      rows: contacts.map((c) => ({
        id: c.conversationId,
        contactId: c.contactId,
      })),
    })

    // Each contact's bulkImportMessages call goes through repository.bulkCreate()
    for (let i = 0; i < N; i++) {
      mockBulkCreate.mockResolvedValueOnce([
        { id: `m-${i}`, sourceId: `msg-${i}` },
      ])
    }

    const batch = contacts.map((c) => ({
      contact: contact(c.sourceId),
      messages: [msg(`msg-${contacts.indexOf(c)}`)],
    }))

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch,
    })

    // trulyNew = 0 (all raced), skippedContacts = 0, importedMessages = N
    expect(result.importedContacts).toBe(0)
    expect(result.skippedContacts).toBe(0)
    // All contacts resolved via race winners → all messages imported
    expect(result.importedMessages).toBe(N)
    expect(result.contactInboxIds.size).toBe(N)
    // All N contactInboxIds should be correctly mapped
    for (const c of contacts) {
      expect(result.contactInboxIds.get(c.sourceId)).toBe(c.contactInboxId)
    }
  })

  // -------------------------------------------------------------------------
  // H4 — bulkImportHistorical parallelizes per-contact bulkImportMessages
  // -------------------------------------------------------------------------

  it("H4: bulkImportMessages calls for multiple contacts run in parallel (p-limit concurrency)", async () => {
    // Set up 4 existing contacts so bulkImportContacts needs no new inserts —
    // we want to test the parallelism of the message-import loop only.
    const contacts = [
      {
        sourceId: "src-a",
        contactId: "cid-a",
        contactInboxId: "ci-a",
        conversationId: "conv-a",
      },
      {
        sourceId: "src-b",
        contactId: "cid-b",
        contactInboxId: "ci-b",
        conversationId: "conv-b",
      },
      {
        sourceId: "src-c",
        contactId: "cid-c",
        contactInboxId: "ci-c",
        conversationId: "conv-c",
      },
      {
        sourceId: "src-d",
        contactId: "cid-d",
        contactInboxId: "ci-d",
        conversationId: "conv-d",
      },
    ]

    // bulkImportContacts: all existing → no cap check needed
    enqueueSelect({
      rows: contacts.map((c) => ({
        id: c.contactInboxId,
        sourceId: c.sourceId,
        contactId: c.contactId,
      })),
    })
    // Conversation lookup for existing contacts
    enqueueSelect({
      rows: contacts.map((c) => ({
        id: c.conversationId,
        contactId: c.contactId,
      })),
    })

    // Track concurrency of repository.bulkCreate calls for the message-import phase.
    // Each bulkImportMessages call invokes bulkCreate once (after messages are built).
    // We defer resolution so p-limit slots stay occupied — then flush them.
    let inFlight = 0
    let maxInFlight = 0
    const resolvers: Array<() => void> = []

    mockBulkCreate.mockImplementation(() => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise<{ id: string; sourceId: string | null }[]>(
        (resolve) => {
          resolvers.push(() => {
            inFlight--
            resolve([])
          })
        },
      )
    })

    const batch = contacts.map((c) => ({
      contact: contact(c.sourceId),
      messages: [msg(`msg-${c.sourceId}`)],
    }))

    const importPromise = bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch,
    })

    // Yield microtasks so the parallel transactions can start
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // With p-limit(≥2), at least 2 bulkCreate calls should be in-flight.
    // With a sequential loop, maxInFlight would be 0 here (none started yet
    // because the first hasn't resolved). With p-limit it should be ≥ 2.
    expect(maxInFlight).toBeGreaterThanOrEqual(2)

    // Drain resolvers one at a time. The 4th task is queued by p-limit (limit=3)
    // and only calls bulkCreate after a slot frees, so we wait for each resolver
    // to appear before resolving the previous one.
    for (let flushed = 0; flushed < 4; flushed++) {
      await vi.waitFor(
        () => expect(resolvers.length).toBeGreaterThan(flushed),
        {
          timeout: 2000,
        },
      )
      await resolvers[flushed]()
    }
    await importPromise

    expect(resolvers).toHaveLength(4)
  })
})
