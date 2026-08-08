import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockApplyCoexistActivityUpdates,
  mockBulkImportContacts,
  mockBulkImportMessages,
  mockClaimRun,
  mockFbLoadContext,
  mockFetchConversationMessages,
  mockFindIntegration,
  mockFindResumeCeiling,
  mockFindRunById,
  mockListConversations,
  mockLoadContext,
  mockMarkFailed,
  mockMarkSucceeded,
  mockQueueAdd,
  mockQueueAddBulk,
  mockResolveContact,
  mockResolveContactProfile,
  mockToHistoricalMessage,
  mockUpdateProgress,
} = vi.hoisted(() => ({
  mockApplyCoexistActivityUpdates: vi.fn(),
  mockBulkImportContacts: vi.fn(),
  mockBulkImportMessages: vi.fn(),
  mockClaimRun: vi.fn(),
  mockFbLoadContext: vi.fn(),
  mockFetchConversationMessages: vi.fn(),
  mockFindIntegration: vi.fn(),
  mockFindResumeCeiling: vi.fn(),
  mockFindRunById: vi.fn(),
  mockListConversations: vi.fn(),
  mockLoadContext: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkSucceeded: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockQueueAddBulk: vi.fn(),
  mockResolveContact: vi.fn(),
  mockResolveContactProfile: vi.fn(),
  mockToHistoricalMessage: vi.fn(),
  mockUpdateProgress: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: {
    claimRun: mockClaimRun,
    findIntegrationForCoexist: mockFindIntegration,
    findResumeCeiling: mockFindResumeCeiling,
    findRunById: mockFindRunById,
    markFailed: mockMarkFailed,
    markSucceeded: mockMarkSucceeded,
    updateProgress: mockUpdateProgress,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistAttachmentDownload: "coexistAttachmentDownload",
    coexistInstagramSync: "coexistInstagramSync",
  },
  integrationQueue: {
    add: mockQueueAdd,
    addBulk: mockQueueAddBulk,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  applyCoexistActivityUpdates: mockApplyCoexistActivityUpdates,
  bulkImportContacts: mockBulkImportContacts,
  bulkImportMessages: mockBulkImportMessages,
  createHistoricalIdFactory: vi.fn(() => () => "historical-id"),
}))

vi.mock("../src/integration/handlers/coexist/instagram-adapter", () => ({
  instagramCoexistAdapter: {
    channel: "instagram",
    discoverContactEnrichment: vi.fn(() => ({})),
    fetchConversationMessages: mockFetchConversationMessages,
    getConversationUpdatedAt: vi.fn(() => new Date("2026-08-01T00:00:00Z")),
    listConversations: mockListConversations,
    loadContext: mockLoadContext,
    resolveContact: mockResolveContact,
    resolveContactProfile: mockResolveContactProfile,
    toHistoricalMessage: mockToHistoricalMessage,
  },
}))

// Provider routing imports the Facebook adapter too; stub it so the native
// (`type: "instagram"`) path stays isolated in this suite.
vi.mock(
  "../src/integration/handlers/coexist/instagram-facebook-adapter",
  () => ({
    instagramFacebookCoexistAdapter: {
      channel: "instagram",
      discoverContactEnrichment: vi.fn(() => ({})),
      fetchConversationMessages: vi.fn(),
      getConversationUpdatedAt: vi.fn(),
      listConversations: vi.fn(),
      loadContext: mockFbLoadContext,
      resolveContact: vi.fn(),
      toHistoricalMessage: vi.fn(),
    },
  }),
)

const { coexistInstagramSync } = await import(
  "../src/integration/handlers/coexist/instagram-sync"
)

const syncData = {
  runId: "run-ig-1",
  integrationId: "integration-ig-1",
  workspaceId: "workspace-1",
}

const contactLink = {
  contactInboxId: "contact-inbox-1",
  contactId: "contact-1",
  conversationId: "conversation-1",
}

describe("coexistInstagramSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Routing probe: default to the native Instagram provider for this suite.
    mockFindIntegration.mockResolvedValue({
      channel: "instagram",
      type: "instagram",
    })
    mockLoadContext.mockResolvedValue({
      inbox: { id: "inbox-1" },
      workspaceId: "workspace-1",
    })
    mockClaimRun.mockResolvedValue({
      attempts: 1,
      currentPageNumber: 0,
      failedCount: 0,
      importedContactCount: 0,
      importedMessageCount: 0,
      lastSyncedAt: null,
      skippedCount: 0,
    })
    mockFindResumeCeiling.mockResolvedValue(null)
    mockFindRunById.mockResolvedValue({
      failedCount: 0,
      importedMessageCount: 2,
      skippedCount: 0,
    })
    mockListConversations.mockResolvedValue({
      conversations: [{ id: "ig-conversation-1" }],
    })
    mockResolveContact.mockReturnValue({
      sourceId: "customer-1",
      firstName: "Customer",
    })
    // Default: no display name resolved → keep the participant fallback.
    mockResolveContactProfile.mockResolvedValue(null)
    mockBulkImportContacts.mockResolvedValue({
      contactInboxIds: new Map([["customer-1", contactLink]]),
      importedContacts: 1,
      skippedContacts: 0,
    })
    mockBulkImportMessages.mockImplementation(
      async (input: { messages: unknown[] }) => ({
        importedMessages: input.messages.length,
        insertedAttachmentIds: [],
        newestIncomingMessageAt: new Date("2026-08-01T00:00:00Z"),
        newestMessageAt: new Date("2026-08-01T00:00:00Z"),
        oldestMessageAt: new Date("2026-08-01T00:00:00Z"),
        skippedMessages: 0,
      }),
    )
    mockApplyCoexistActivityUpdates.mockResolvedValue(undefined)
    mockMarkFailed.mockResolvedValue(undefined)
    mockMarkSucceeded.mockResolvedValue(undefined)
    mockQueueAdd.mockResolvedValue(undefined)
    mockQueueAddBulk.mockResolvedValue(undefined)
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it("walks all message pages within an Instagram conversation", async () => {
    mockFetchConversationMessages
      .mockResolvedValueOnce({
        after: "message-cursor-2",
        messages: [{ id: "message-1", message: "first" }],
      })
      .mockResolvedValueOnce({
        messages: [{ id: "message-2", message: "second" }],
      })
    mockToHistoricalMessage
      .mockReturnValueOnce({
        sourceId: "message-1",
        messageType: "incoming",
        contentType: "text",
        text: "first",
      })
      .mockReturnValueOnce({
        sourceId: "message-2",
        messageType: "incoming",
        contentType: "text",
        text: "second",
      })

    await coexistInstagramSync(syncData)

    expect(mockFetchConversationMessages).toHaveBeenCalledTimes(2)
    expect(mockFetchConversationMessages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conversationId: "ig-conversation-1",
        cursor: undefined,
      }),
    )
    expect(mockFetchConversationMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: "ig-conversation-1",
        cursor: "message-cursor-2",
      }),
    )
    expect(mockBulkImportMessages).toHaveBeenCalledTimes(2)
    expect(mockBulkImportMessages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: [expect.objectContaining({ sourceId: "message-1" })],
      }),
    )
    expect(mockBulkImportMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [expect.objectContaining({ sourceId: "message-2" })],
      }),
    )
    expect(mockMarkSucceeded).toHaveBeenCalledWith({ runId: "run-ig-1" })
  })

  it("does not wipe the resume watermark when a page processes no conversation", async () => {
    // Resume from a prior watermark: the only conversation (updated 2026-08-01,
    // per the mocked getConversationUpdatedAt) is newer than the frontier, so it
    // is skipped by the resume guard and nothing is processed this page.
    mockClaimRun.mockResolvedValue({
      attempts: 1,
      currentPageNumber: 3,
      failedCount: 0,
      importedContactCount: 0,
      importedMessageCount: 0,
      lastSyncedAt: new Date("2026-07-01T00:00:00Z"),
      skippedCount: 0,
    })
    mockFindRunById.mockResolvedValue({
      failedCount: 0,
      importedMessageCount: 0,
      skippedCount: 0,
    })

    await coexistInstagramSync(syncData)

    // The whole page was skipped, so fetch was never called...
    expect(mockFetchConversationMessages).not.toHaveBeenCalled()
    // ...and progress must NOT persist a null watermark (which would erase the
    // prior watermark and force a full re-scan on the next continuation).
    expect(mockUpdateProgress).toHaveBeenCalled()
    for (const call of mockUpdateProgress.mock.calls) {
      expect(call[0].fields).not.toHaveProperty("lastSyncedAt", null)
      expect(call[0].fields.lastSyncedAt ?? undefined).not.toBeNull()
    }
  })

  it("saves the contact's real name split into first/last from the user node", async () => {
    mockResolveContactProfile.mockResolvedValue({
      name: "Rock Phan",
      usageSignal: null,
    })
    mockFetchConversationMessages.mockResolvedValue({
      messages: [{ id: "message-1", message: "hi" }],
    })
    mockToHistoricalMessage.mockReturnValue({
      sourceId: "message-1",
      messageType: "incoming",
      contentType: "text",
      text: "hi",
    })

    await coexistInstagramSync(syncData)

    expect(mockResolveContactProfile).toHaveBeenCalledWith({
      context: expect.anything(),
      sourceId: "customer-1",
    })
    expect(mockBulkImportContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: [
          expect.objectContaining({
            sourceId: "customer-1",
            firstName: "Rock",
            lastName: "Phan",
          }),
        ],
      }),
    )
  })

  it("routes a Facebook-linked Instagram integration to the Facebook adapter", async () => {
    mockFindIntegration.mockResolvedValue({
      channel: "instagram",
      type: "facebook",
    })
    // Fail fast after routing — enough to prove which adapter was selected.
    mockFbLoadContext.mockResolvedValue(null)

    await coexistInstagramSync(syncData)

    expect(mockFbLoadContext).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-ig-1",
    })
    expect(mockLoadContext).not.toHaveBeenCalled()
  })

  it("routes a native Instagram integration to the native adapter", async () => {
    mockFindIntegration.mockResolvedValue({
      channel: "instagram",
      type: "instagram",
    })
    mockLoadContext.mockResolvedValue(null)

    await coexistInstagramSync(syncData)

    expect(mockLoadContext).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-ig-1",
    })
    expect(mockFbLoadContext).not.toHaveBeenCalled()
  })

  it("fails the run when the integration cannot be resolved for routing", async () => {
    mockFindIntegration.mockResolvedValue(null)

    await coexistInstagramSync(syncData)

    expect(mockLoadContext).not.toHaveBeenCalled()
    expect(mockFbLoadContext).not.toHaveBeenCalled()
    expect(mockMarkFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-ig-1" }),
    )
  })
})
