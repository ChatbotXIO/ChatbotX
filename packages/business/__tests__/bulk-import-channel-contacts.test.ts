import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// `bulkImportChannelContacts` moved here verbatim (Phase 4a,
// `docs/plans/2026-09-09-automatic-contact-scan.md`) from
// `apps/worker/src/integration/handlers/coexist/bulk-historical-import.ts`'s
// `bulkImportContacts`. These are the dedup / contact-resolution / event /
// workspace-usage cases that used to live in the worker-level
// `bulk-historical-import.test.ts` (mocking `coexistImportService` there via
// the `@chatbotx.io/business` barrel) — moved here because the function now
// lives in this package and imports its dependencies by relative path, so the
// worker-level barrel mock can no longer intercept them. The worker test now
// mocks `bulkImportChannelContacts` itself as an external dependency; its
// internal behavior is only tested here.
// ---------------------------------------------------------------------------

const {
  mockResolveOrCreateContactLinks,
  mockWorkspaceUsageIncrement,
  mockEmit,
  mockEmitContactCreated,
} = vi.hoisted(() => ({
  mockResolveOrCreateContactLinks: vi.fn(),
  mockWorkspaceUsageIncrement: vi.fn().mockResolvedValue(undefined),
  mockEmit: vi.fn(() => Promise.resolve()),
  mockEmitContactCreated: vi.fn(() => Promise.resolve()),
}))

vi.mock("../src/coexist-import/service", () => ({
  coexistImportService: {
    resolveOrCreateContactLinks: mockResolveOrCreateContactLinks,
  },
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: {
    increment: mockWorkspaceUsageIncrement,
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))

const { bulkImportChannelContacts } = await import(
  "../src/contact/bulk-import-channel-contacts"
)

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

type NewContactStub = {
  sourceId: string
  contactId: string
  contactInboxId: string
  conversationId: string
}

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

describe("bulkImportChannelContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceUsageIncrement.mockResolvedValue(undefined)
  })

  it("returns zero counts without calling resolveOrCreateContactLinks for an empty batch", async () => {
    const result = await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [],
    })

    expect(result).toEqual({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map(),
      newContactInboxIds: new Map(),
    })
    expect(mockResolveOrCreateContactLinks).not.toHaveBeenCalled()
  })

  it("skips contacts with no sourceId and returns zero counts when nothing survives dedup", async () => {
    const result = await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [{ sourceId: "" }, { sourceId: undefined as never }],
    })

    expect(result.importedContacts).toBe(0)
    expect(mockResolveOrCreateContactLinks).not.toHaveBeenCalled()
  })

  it("dedups contacts sharing a sourceId, preferring the first non-null field", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])

    await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [
        contact("src-1", { firstName: "Alice", email: undefined }),
        contact("src-1", { firstName: "Zoe", email: "zoe@example.com" }),
      ],
    })

    expect(mockResolveOrCreateContactLinks).toHaveBeenCalledOnce()
    const [call] = mockResolveOrCreateContactLinks.mock.calls[0]
    const merged = call.dedup.get("src-1")
    expect(merged.firstName).toBe("Alice")
    expect(merged.email).toBe("zoe@example.com")
  })

  it("passes only entries carrying a sourceUserId into sourceUserIds", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])

    await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [
        contact("src-1", { sourceUserId: "scoped-1" }),
        contact("src-2"),
      ],
    })

    const [call] = mockResolveOrCreateContactLinks.mock.calls[0]
    expect(call.sourceUserIds).toEqual(["scoped-1"])
    expect(call.sourceIds).toEqual(expect.arrayContaining(["src-1", "src-2"]))
  })

  it("resolves new contacts and returns their links", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])

    const result = await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [contact("src-1")],
    })

    expect(result.importedContacts).toBe(1)
    expect(result.contactInboxIds.get("src-1")).toEqual({
      contactInboxId: "ci-1",
      contactId: "id-1",
      conversationId: "conv-1",
    })
  })

  it("newContactInboxIds narrows contactInboxIds to only the newly-created sourceIds", async () => {
    mockResolveOrCreateContactLinks.mockResolvedValueOnce({
      importedContacts: 1,
      contactInboxIds: new Map([
        [
          "src-new",
          {
            contactInboxId: "ci-new",
            contactId: "id-new",
            conversationId: "conv-new",
          },
        ],
        [
          "src-existing",
          {
            contactInboxId: "ci-existing",
            contactId: "id-existing",
            conversationId: "conv-existing",
          },
        ],
      ]),
      newContactCreatedEvents: [
        {
          workspaceId,
          contactId: "id-new",
          contactInboxId: "ci-new",
          sourceId: "src-new",
          firstName: "Bob",
          phoneNumber: undefined,
          email: "bob@example.com",
          channel: inbox.channel,
          source: "inboundMessage",
          createdAt: new Date(),
        },
      ],
    })

    const result = await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [contact("src-new"), contact("src-existing")],
    })

    expect(result.newContactInboxIds.size).toBe(1)
    expect(result.newContactInboxIds.get("src-new")).toEqual({
      contactInboxId: "ci-new",
      contactId: "id-new",
      conversationId: "conv-new",
    })
    expect(result.newContactInboxIds.has("src-existing")).toBe(false)
    // The full map still carries both — unaffected by the new field.
    expect(result.contactInboxIds.size).toBe(2)
  })

  it("emits contactCreated + analytics events for every newly-created contact", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])

    await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [contact("src-1")],
    })

    expect(mockEmitContactCreated).toHaveBeenCalledWith(
      "ws-1",
      "id-1",
      "Bob",
      undefined,
      "bob@example.com",
      "ci-1",
    )
    expect(mockEmit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        eventType: "contact:created",
        workspaceId: "ws-1",
        contactId: "ci-1",
        sourceId: "src-1",
      }),
    )
  })

  it("increments workspace usage (info-only) for newly-created contacts", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])

    await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [contact("src-1")],
    })

    expect(mockWorkspaceUsageIncrement).toHaveBeenCalledWith(
      workspaceId,
      "contacts",
      1,
    )
  })

  it("does not touch workspace usage when no new contact is created", async () => {
    mockResolveOrCreateContactLinks.mockResolvedValueOnce({
      importedContacts: 0,
      contactInboxIds: new Map([
        [
          "src-1",
          {
            contactInboxId: "ci-existing",
            contactId: "c-existing",
            conversationId: "conv-existing",
          },
        ],
      ]),
      newContactCreatedEvents: [],
    })

    const result = await bulkImportChannelContacts({
      inbox,
      workspaceId,
      contacts: [contact("src-1")],
    })

    expect(result.importedContacts).toBe(0)
    expect(mockWorkspaceUsageIncrement).not.toHaveBeenCalled()
    expect(mockEmitContactCreated).not.toHaveBeenCalled()
  })

  it("swallows a workspace-usage increment failure without throwing", async () => {
    stubNewContactsResolution([
      {
        sourceId: "src-1",
        contactId: "id-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
      },
    ])
    mockWorkspaceUsageIncrement.mockRejectedValueOnce(new Error("boom"))

    await expect(
      bulkImportChannelContacts({
        inbox,
        workspaceId,
        contacts: [contact("src-1")],
      }),
    ).resolves.toMatchObject({ importedContacts: 1 })
  })
})
