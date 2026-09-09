import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Phase 4a of the Automatic Customer Scan plan
// (`docs/plans/2026-09-09-automatic-contact-scan.md`) moved `bulkImportContacts`
// verbatim to `packages/business/src/contact/bulk-import-channel-contacts.ts`
// as `bulkImportChannelContacts` — `bulk-historical-import.ts` now only
// re-exports it under the old name. Its dedup / contact-resolution / event /
// workspace-usage behavior is covered directly by
// `packages/business/__tests__/bulk-import-channel-contacts.test.ts`.
//
// This suite tests `bulkImportHistorical`'s OWN orchestration (message import
// per contact, activity-update batching, attachment id aggregation,
// concurrency) — everything downstream of contact resolution — so
// `bulkImportChannelContacts` (aliased `bulkImportContacts` by the file under
// test) is mocked at the boundary, same as the coexist sync handlers'
// existing tests already do.
// ---------------------------------------------------------------------------

const {
  mockEmitContactCreated,
  mockEmit,
  mockBulkCreate,
  mockBulkUpdateTracking,
  mockCreateMessageRepository,
  mockBulkImportChannelContacts,
  mockEnrichIfNull,
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
    mockBulkImportChannelContacts: vi.fn(),
    mockEnrichIfNull: vi.fn().mockResolvedValue(undefined),
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
  bulkImportChannelContacts: mockBulkImportChannelContacts,
  contactInboxService: {
    bulkUpdateTracking: mockBulkUpdateTracking,
  },
  conversationService: {
    bulkAdvanceActivityAndAiContextMarker:
      mockBulkAdvanceActivityAndAiContextMarker,
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
// Helpers — wire `bulkImportChannelContacts` (mocked at the
// `@chatbotx.io/business` boundary) with a canned resolution. Its own
// dedup/event/usage behavior is covered in
// packages/business/__tests__/bulk-import-channel-contacts.test.ts; here we
// only assert `bulkImportHistorical` consumes the returned link map
// correctly.
// ---------------------------------------------------------------------------

type ContactStub = {
  sourceId: string
  contactId: string
  contactInboxId: string
  conversationId: string
}

const stubContactsResolution = (
  contacts: ContactStub[],
  importedContacts = contacts.length,
) => {
  mockBulkImportChannelContacts.mockResolvedValueOnce({
    importedContacts,
    skippedContacts: 0,
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
    // Matches the real `bulkImportChannelContacts`'s early-return shape for
    // an empty/all-filtered contacts array — `bulkImportHistorical` always
    // calls it once with `batch.map(b => b.contact)`, so tests that pass an
    // empty batch need this default rather than `undefined`.
    mockBulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map(),
    })
  })

  it("empty batch returns zero counts and never calls bulkImportMessages/bulkCreate", async () => {
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
    // `bulkImportChannelContacts` is always called (it owns the
    // empty-contacts early return internally — covered in
    // packages/business/__tests__/bulk-import-channel-contacts.test.ts); the
    // per-contact message loop over an empty `batch` must never reach
    // `bulkCreate`.
    expect(mockBulkImportChannelContacts).toHaveBeenCalledWith({
      inbox,
      workspaceId,
      contacts: [],
    })
    expect(mockBulkCreate).not.toHaveBeenCalled()
  })

  it("inserts new contact + messages when no existing ContactInbox matches", async () => {
    stubContactsResolution([
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
  })

  it("passes the resolved batch contacts through to bulkImportChannelContacts", async () => {
    stubContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockBulkCreate.mockResolvedValueOnce([])

    await bulkImportHistorical({
      inbox,
      workspaceId,
      runId: "12345",
      aiReadsSyncedHistory: false,
      batch: [{ contact: contact("src-1"), messages: [] }],
    })

    expect(mockBulkImportChannelContacts).toHaveBeenCalledWith({
      inbox,
      workspaceId,
      contacts: [contact("src-1")],
    })
  })

  it("flushes contact-inbox activity in one bulk service call", async () => {
    const firstMessageAt = new Date("2026-07-01T01:00:00.000Z")
    const secondMessageAt = new Date("2026-07-02T02:00:00.000Z")
    stubContactsResolution([
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
    stubContactsResolution([
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
    stubContactsResolution([
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
    stubContactsResolution([
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

  it("uses the resolved ContactInbox link for an already-known sourceId (idempotent re-run)", async () => {
    // Resolved link present without a new contact import — mirrors the
    // idempotent re-run scenario.
    stubContactsResolution(
      [
        {
          sourceId: "src-1",
          contactId: "c-existing",
          contactInboxId: "ci-existing",
          conversationId: "conv-existing",
        },
      ],
      0,
    )
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

  it("processes batch entries that share a sourceId independently against the resolved shared link", async () => {
    stubContactsResolution([
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
  // H7 — bulkImportHistorical consumes a large resolved-links map correctly
  // -------------------------------------------------------------------------

  it("H7: consumes a large resolved-links map correctly (N contacts)", async () => {
    // The O(n²)→O(n) raced-contact-resolution internals this originally
    // exercised now live inside `bulkImportChannelContacts`
    // (`packages/business/src/contact/bulk-import-channel-contacts.ts`), and
    // ultimately `coexistImportService.resolveOrCreateContactLinks`
    // (`packages/business/src/coexist-import/service.ts`) — covered there,
    // not here. Here we only assert the worker correctly consumes a large
    // resolved-links map end to end into per-contact message imports.
    const N = 50
    const contacts = Array.from({ length: N }, (_, i) => ({
      sourceId: `src-${i}`,
      contactId: `cid-${i}`,
      contactInboxId: `ci-${i}`,
      conversationId: `conv-${i}`,
    }))

    stubContactsResolution(contacts, 0)

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

    expect(result.importedContacts).toBe(0)
    expect(result.skippedContacts).toBe(0)
    expect(result.importedMessages).toBe(N)
    expect(result.contactInboxIds.size).toBe(N)
    for (const c of contacts) {
      expect(result.contactInboxIds.get(c.sourceId)).toBe(c.contactInboxId)
    }
  })

  // -------------------------------------------------------------------------
  // H4 — bulkImportHistorical parallelizes per-contact bulkImportMessages
  // -------------------------------------------------------------------------

  it("H4: bulkImportMessages calls for multiple contacts run in parallel (p-limit concurrency)", async () => {
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

    stubContactsResolution(contacts, 0)

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
