import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mocks. The whole `bulkImportContacts` transaction (select existing
// ContactInbox rows, resolve/heal Conversations, insert Contact+ContactInbox+
// Conversation, race recovery, scoped-user-id aliasing) moved VERBATIM into
// `coexistImportService.resolveOrCreateContactLinks` — the worker layer no
// longer touches `db`/`tx` at all for that phase. `bulkImportMessages` still
// inserts via `createMessageRepository().bulkCreate()` (unchanged) but now
// enriches the Contact row via `contactRepository.enrichIfNull` instead of a
// raw `tx.execute(sql...)`.
// ---------------------------------------------------------------------------

const {
  mockEmitContactCreated,
  mockEmit,
  mockBulkCreate,
  mockBulkUpdateTracking,
  mockCreateMessageRepository,
  mockResolveOrCreateContactLinks,
  mockEnrichIfNull,
  mockWorkspaceUsageIncrement,
  mockBulkAdvanceActivityAndAiContextMarker,
} = vi.hoisted(() => {
  const mockBulkCreate = vi.fn().mockResolvedValue([])
  const mockBulkCreateAttachments = vi.fn().mockResolvedValue([])
  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    bulkCreate: mockBulkCreate,
    bulkCreateAttachments: mockBulkCreateAttachments,
  })
  return {
    mockEmitContactCreated: vi.fn(() => Promise.resolve()),
    mockEmit: vi.fn(() => Promise.resolve()),
    mockBulkCreate,
    mockBulkUpdateTracking: vi.fn().mockResolvedValue(null),
    mockCreateMessageRepository,
    mockResolveOrCreateContactLinks: vi.fn(),
    mockEnrichIfNull: vi.fn().mockResolvedValue(undefined),
    mockWorkspaceUsageIncrement: vi.fn().mockResolvedValue(undefined),
    mockBulkAdvanceActivityAndAiContextMarker: vi
      .fn()
      .mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  describeDatabaseError: vi.fn((err: unknown) => err),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  contactRepository: {
    enrichIfNull: mockEnrichIfNull,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistImportService: {
    resolveOrCreateContactLinks: mockResolveOrCreateContactLinks,
  },
  contactInboxService: {
    bulkUpdateTracking: mockBulkUpdateTracking,
  },
  conversationService: {
    bulkAdvanceActivityAndAiContextMarker:
      mockBulkAdvanceActivityAndAiContextMarker,
  },
  workspaceUsageService: {
    increment: mockWorkspaceUsageIncrement,
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { bulkImportHistorical } from "../src/integration/handlers/coexist/bulk-historical-import"

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
// Helpers — wire `coexistImportService.resolveOrCreateContactLinks`, which now
// owns the whole contact-resolution transaction (select existing rows, heal
// orphan conversations, insert Contact/ContactInbox/Conversation, race
// recovery, scoped-user-id aliasing) VERBATIM — see
// packages/business/src/coexist-import/service.ts. The worker-layer test only
// asserts `bulkImportContacts`/`bulkImportHistorical` consume this result
// correctly; the transaction internals are covered at the business-service
// layer, not here.
// ---------------------------------------------------------------------------

type NewContactStub = {
  sourceId: string
  contactId: string
  contactInboxId: string
  conversationId: string
}

/** "New contacts" happy path — every entry is newly created. */
const stubNewContactsResolution = (contacts: NewContactStub[]) => {
  mockResolveOrCreateContactLinks.mockResolvedValueOnce({
    importedContacts: contacts.length,
    contactInboxIds: new Map(
      contacts.map((c) => [
        c.sourceId,
        {
          contactInboxId: c.contactInboxId,
          contactId: c.contactId,
          conversationId: c.conversationId,
        },
      ]),
    ),
    newContactCreatedEvents: contacts.map((c) => ({
      workspaceId,
      contactId: c.contactId,
      contactInboxId: c.contactInboxId,
      sourceId: c.sourceId,
      firstName: "Bob",
      phoneNumber: undefined,
      email: "bob@example.com",
      channel: inbox.channel,
      source: "inboundMessage",
      createdAt: new Date(),
    })),
  })
}

type ExistingContactStub = {
  sourceId: string
  contactId: string
  contactInboxId: string
  conversationId: string
}

/** "Already exists" path — every entry resolves to a pre-existing row, no new
 *  contact created and no `newContactCreatedEvents` emitted. */
const stubExistingContactsResolution = (contacts: ExistingContactStub[]) => {
  mockResolveOrCreateContactLinks.mockResolvedValueOnce({
    importedContacts: 0,
    contactInboxIds: new Map(
      contacts.map((c) => [
        c.sourceId,
        {
          contactInboxId: c.contactInboxId,
          contactId: c.contactId,
          conversationId: c.conversationId,
        },
      ]),
    ),
    newContactCreatedEvents: [],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkImportHistorical", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-wire repository mock after clearAllMocks.
    mockBulkCreate.mockResolvedValue([])
    mockBulkUpdateTracking.mockResolvedValue(null)
    mockBulkAdvanceActivityAndAiContextMarker.mockResolvedValue(undefined)
    mockCreateMessageRepository.mockResolvedValue({
      bulkCreate: mockBulkCreate,
      bulkCreateAttachments: vi.fn().mockResolvedValue([]),
    })
    mockEnrichIfNull.mockResolvedValue(undefined)
    mockWorkspaceUsageIncrement.mockResolvedValue(undefined)
  })

  it("empty batch returns zero counts without calling resolveOrCreateContactLinks", async () => {
    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
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
    expect(mockResolveOrCreateContactLinks).not.toHaveBeenCalled()
  })

  it("inserts new contact + messages when no existing ContactInbox matches", async () => {
    stubNewContactsResolution([
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
      aiReadsSyncedHistory: false,
      batch: [{ contact: contact("src-1"), messages: [msg("m-src-1")] }],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.importedMessages).toBe(1)
    expect(result.skippedContacts).toBe(0)
    expect(result.failedMessages).toBe(0)
    expect(result.contactInboxIds.get("src-1")).toBe("ci-1")
    // Threads the newly-created ContactInbox id (not the contact id) into
    // emitContactCreated so a Trigger action attributes to this channel.
    expect(mockEmitContactCreated).toHaveBeenCalledWith(
      "ws-1",
      "id-1",
      "Bob",
      undefined,
      "bob@example.com",
      "ci-1",
    )
  })

  it("tracks workspace usage for newly-imported coexist contacts without consuming quota", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([{ id: "m-1", sourceId: "m-src-1" }])

    await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
      batch: [{ contact: contact("src-1"), messages: [msg("m-src-1")] }],
    })

    expect(mockWorkspaceUsageIncrement).toHaveBeenCalledWith(
      workspaceId,
      "contacts",
      1,
    )
  })

  it("does not touch the contacts quota when no new contact is imported", async () => {
    // All contacts already exist — resolveOrCreateContactLinks resolves them
    // without any new insert, so importedContacts stays 0 (mirrors the
    // idempotent re-run scenario below).
    stubExistingContactsResolution([
      {
        sourceId: "src-1",
        contactId: "c-existing",
        contactInboxId: "ci-existing",
        conversationId: "conv-existing",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
      batch: [{ contact: contact("src-1"), messages: [] }],
    })

    expect(result.importedContacts).toBe(0)
    expect(mockWorkspaceUsageIncrement).not.toHaveBeenCalled()
  })

  it("flushes contact-inbox activity in one bulk service call", async () => {
    const firstMessageAt = new Date("2026-07-01T01:00:00.000Z")
    const secondMessageAt = new Date("2026-07-02T02:00:00.000Z")
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
      {
        sourceId: "src-2",
        contactId: "contact-2",
        contactInboxId: "ci-2",
        conversationId: "conv-2",
      },
    ])
    mockBulkCreate.mockResolvedValue([{ id: "m-1", sourceId: "m-src" }])

    await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
      batch: [
        {
          contact: contact("src-1"),
          messages: [msg("m-src-1", { createdAt: firstMessageAt })],
        },
        {
          contact: contact("src-2"),
          messages: [msg("m-src-2", { createdAt: secondMessageAt })],
        },
      ],
    })

    expect(mockBulkUpdateTracking).toHaveBeenCalledTimes(1)
    expect(mockBulkUpdateTracking).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        {
          contactInboxId: "ci-1",
          contactId: "contact-1",
          workspaceId: "ws-1",
          firstInteractionAt: firstMessageAt,
          lastMessageAt: firstMessageAt,
          lastIncomingMessageAt: firstMessageAt,
        },
        {
          contactInboxId: "ci-2",
          contactId: "contact-2",
          workspaceId: "ws-1",
          firstInteractionAt: secondMessageAt,
          lastMessageAt: secondMessageAt,
          lastIncomingMessageAt: secondMessageAt,
        },
      ]),
    })
  })

  it("advances the AI marker by default (aiReadsSyncedHistory: false) so the AI ignores synced history", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    // Numeric ids so `maxMessageId` (BigInt-based) resolves a real marker.
    mockBulkCreate.mockResolvedValueOnce([
      { id: "100000000000001", sourceId: "m-src-1" },
      { id: "200000000000002", sourceId: "m-src-2" },
    ])

    await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
      batch: [
        {
          contact: contact("src-1"),
          messages: [msg("m-src-1"), msg("m-src-2")],
        },
      ],
    })

    expect(mockBulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledTimes(1)
    expect(mockBulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        rows: expect.arrayContaining([
          expect.objectContaining({
            conversationId: "conv-1",
            aiMarkerMessageId: "200000000000002",
          }),
        ]),
      }),
    )
  })

  it("leaves the marker untouched (null) for every row when aiReadsSyncedHistory is true, so the AI reads synced history", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([
      { id: "100000000000001", sourceId: "m-src-1" },
    ])

    await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: true,
      batch: [
        {
          contact: contact("src-1"),
          // A valid API createdAt so the activity row still carries a
          // non-null `newestMessageAt` and reaches conversationService: with
          // aiReadsSyncedHistory=true AND no valid timestamp at all, no row
          // would be pushed at all (see bulk-import-messages.test.ts's
          // applyCoexistActivityUpdates suite for that absence case).
          messages: [
            msg("m-src-1", { createdAt: new Date("2026-07-01T00:00:00Z") }),
          ],
        },
      ],
    })

    expect(mockBulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledTimes(1)
    const [call] = mockBulkAdvanceActivityAndAiContextMarker.mock.calls[0]
    for (const row of call.rows) {
      expect(row.aiMarkerMessageId).toBeNull()
    }
  })

  it("counts duplicates as skippedMessages when message INSERT returns fewer rows than input", async () => {
    stubNewContactsResolution([
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
      aiReadsSyncedHistory: false,
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
    // existing row present — resolveOrCreateContactLinks resolves it without
    // any new insert.
    stubExistingContactsResolution([
      {
        sourceId: "src-1",
        contactId: "c-existing",
        contactInboxId: "ci-existing",
        conversationId: "conv-existing",
      },
    ])
    // No new contacts → skips cap check, contact insert, etc.
    // Goes straight to repository.bulkCreate() for messages.
    mockBulkCreate.mockResolvedValueOnce([])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
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
    stubNewContactsResolution([
      {
        sourceId: "src-shared",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([
      { id: "100000000000001", sourceId: "m-a" },
      { id: "100000000000002", sourceId: "m-b" },
    ])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
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
    // This exercised the O(n²)→O(n) raced-contact-resolution internals of
    // `bulkImportContacts`'s transaction, which moved VERBATIM into
    // `coexistImportService.resolveOrCreateContactLinks`
    // (packages/business/src/coexist-import/service.ts) — the race-recovery
    // logic itself is covered there, not at this worker-layer boundary. Here
    // we only assert the worker correctly consumes a large resolved-links map
    // (e.g. from an all-raced resolution) end to end into per-contact message
    // imports.
    //
    // With N = 50 contacts this exercises the large-batch path without being slow.
    const N = 50
    const contacts = Array.from({ length: N }, (_, i) => ({
      sourceId: `src-${i}`,
      contactId: `cid-${i}`,
      contactInboxId: `ci-${i}`,
      conversationId: `conv-${i}`,
    }))

    // All raced → resolved via winner re-SELECT internally, trulyNew = 0.
    stubExistingContactsResolution(contacts)

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
      aiReadsSyncedHistory: false,
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

  it("resolves an entry by scoped user id to the existing row instead of inserting", async () => {
    // A username-adopter thread keyed by its BSUID, whose BSUID already
    // belongs to a phone-keyed row in this inbox. Inserting would violate
    // the partial unique index (inboxId, sourceUserId) and abort the batch;
    // the entry must resolve to the existing row up front. This resolution
    // itself is now owned by `coexistImportService.resolveOrCreateContactLinks`
    // — the worker layer only consumes the resolved link, keyed by the
    // entry's own sourceUserId-based import key ("user.abc"), same as before.
    stubExistingContactsResolution([
      {
        sourceId: "user.abc",
        contactId: "c-old",
        contactInboxId: "ci-old",
        conversationId: "conv-old",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([{ id: "m-1", sourceId: "m-src-1" }])

    const result = await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      batch: [
        {
          contact: contact("user.abc", { sourceUserId: "user.abc" }),
          messages: [msg("m-src-1")],
        },
      ],
    })

    expect(result.importedContacts).toBe(0)
    expect(result.importedMessages).toBe(1)
    expect(result.contactInboxIds.get("user.abc")).toBe("ci-old")
    // No new-contact insert was attempted — resolveOrCreateContactLinks
    // reports zero imported contacts (the conflict never fires).
    expect(mockResolveOrCreateContactLinks).toHaveBeenCalledOnce()
  })

  // NOTE: the targetless-onConflictDoNothing pin (a target on
  // (inboxId, sourceId) would let a conflict on the partial
  // (inboxId, sourceUserId) index abort the whole batch) and the
  // raced-scoped-id winner-aliasing behavior both live entirely inside the
  // `resolveOrCreateContactLinks` transaction now — see
  // packages/business/src/coexist-import/service.ts, which is the correct
  // place to assert those DB-shape invariants going forward. At the worker
  // boundary we only assert the resolved link is consumed and threaded
  // through message import + emitted events correctly, covered by the
  // "resolves an entry by scoped user id" test above and
  // "inserts new contact + messages" below.

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

    // bulkImportContacts: all existing → no new-contact insert needed
    stubExistingContactsResolution(contacts)

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
      aiReadsSyncedHistory: false,
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
