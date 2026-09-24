import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  bulkImportChannelContacts: vi.fn(),
  bulkPatchProfiles: vi.fn().mockResolvedValue(undefined),
  findContactInboxesBySourceIds: vi.fn(),
  bulkCreate: vi.fn(),
  findManyBySourceIds: vi.fn(),
  findManyOnWriteShardBySourceIds: vi.fn(),
  findAttachmentSourceIdsByMessageIds: vi.fn().mockResolvedValue([]),
  bulkCreateAttachments: vi.fn().mockResolvedValue([]),
  bulkUpdateTracking: vi.fn().mockResolvedValue(null),
  bulkAdvanceActivityAndAiContextMarker: vi.fn().mockResolvedValue(undefined),
  broadcast: vi.fn().mockResolvedValue(undefined),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("../src/contact/bulk-import-channel-contacts", () => ({
  bulkImportChannelContacts: mocks.bulkImportChannelContacts,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactRepository: {
    bulkPatchProfiles: mocks.bulkPatchProfiles,
  },
  contactInboxRepository: {
    findByInboxAndSourceIds: mocks.findContactInboxesBySourceIds,
  },
  createMessageRepository: vi.fn().mockResolvedValue({
    bulkCreate: mocks.bulkCreate,
    findManyBySourceIds: mocks.findManyBySourceIds,
    findManyOnWriteShardBySourceIds: mocks.findManyOnWriteShardBySourceIds,
    findAttachmentSourceIdsByMessageIds:
      mocks.findAttachmentSourceIdsByMessageIds,
    bulkCreateAttachments: mocks.bulkCreateAttachments,
  }),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { bulkUpdateTracking: mocks.bulkUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    bulkAdvanceActivityAndAiContextMarker:
      mocks.bulkAdvanceActivityAndAiContextMarker,
  },
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  broadcastToWorkspaceParty: mocks.broadcast,
}))

vi.mock("../src/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}))

const { messengerEchoBatchService } = await import(
  "../src/message/messenger-echo-batch-service"
)

const now = new Date("2026-09-25T00:00:00.000Z")
const inbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "messenger",
} as never
const realtimeTarget = { url: "https://realtime.example", secret: "secret" }

const item = (
  sourceId: string,
  contactSourceId: string,
  overrides: Record<string, unknown> = {},
) => ({
  sourceId,
  contactSourceId,
  createdAt: now,
  text: `text-${sourceId}`,
  contentType: "text" as const,
  contentAttributes: undefined,
  attachments: [],
  raw: { sourceId },
  ...overrides,
})

const link = (suffix: string) => ({
  contactId: `contact-${suffix}`,
  contactInboxId: `ci-${suffix}`,
  conversationId: `conv-${suffix}`,
})

const messageRow = (sourceId: string, suffix: string) => ({
  id: `message-${suffix}`,
  workspaceId: "ws-1",
  conversationId: `conv-${suffix}`,
  contactInboxId: `ci-${suffix}`,
  sourceId,
  senderType: "user" as const,
  senderId: null,
  messageType: "outgoing" as const,
  text: `text-${sourceId}`,
  contentType: "text" as const,
  contentAttributes: null,
  type: "message" as const,
  parentId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  attributes: null,
  sendError: null,
})

const makePorts = () => ({
  fetchProfile: vi.fn().mockResolvedValue({
    firstName: "Ada",
    lastName: "Lovelace",
    locale: "en_GB",
    timezone: "Europe/London",
  }),
  downloadAttachments: vi.fn().mockResolvedValue([]),
  onTextMessagesPersisted: vi.fn().mockResolvedValue(undefined),
  fallbackToSingleEvent: vi.fn().mockResolvedValue(undefined),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findContactInboxesBySourceIds.mockImplementation(
    ({ sourceIds }: { sourceIds: string[] }) =>
      Promise.resolve(
        sourceIds.map((sourceId) => ({
          id: `ci-${sourceId}`,
          sourceId,
          lastIncomingMessageAt: null,
          createdAt: now,
        })),
      ),
  )
  mocks.findAttachmentSourceIdsByMessageIds.mockResolvedValue([])
  mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([])
  mocks.bulkCreateAttachments.mockResolvedValue([])
  mocks.bulkUpdateTracking.mockResolvedValue(null)
  mocks.bulkAdvanceActivityAndAiContextMarker.mockResolvedValue(undefined)
  mocks.broadcast.mockResolvedValue(undefined)
  mocks.bulkPatchProfiles.mockResolvedValue(undefined)
})

describe("messengerEchoBatchService", () => {
  test("persists a mixed batch with bounded new-contact profiles, attachments, tracking, broadcasts, and text hooks", async () => {
    const items = [
      item("mid-1", "psid-1", {
        attachments: [{ sourceId: "attachment-1", type: "image" }],
      }),
      item("mid-2", "psid-2"),
      item("mid-3", "psid-3", { contentType: "location", text: undefined }),
    ]
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 2,
      skippedContacts: 0,
      contactInboxIds: new Map([
        ["psid-1", link("1")],
        ["psid-2", link("2")],
        ["psid-3", link("3")],
      ]),
      newContactInboxIds: new Map([
        ["psid-1", link("1")],
        ["psid-2", link("2")],
      ]),
    })
    mocks.bulkCreate.mockResolvedValue([
      messageRow("mid-1", "1"),
      messageRow("mid-2", "2"),
      { ...messageRow("mid-3", "3"), contentType: "location", text: null },
    ])
    mocks.findManyBySourceIds.mockResolvedValue([])
    mocks.findContactInboxesBySourceIds.mockResolvedValue([
      {
        id: "ci-psid-3",
        sourceId: "psid-3",
        lastIncomingMessageAt: null,
        createdAt: now,
      },
    ])

    const ports = makePorts()
    let activeProfiles = 0
    let maxActiveProfiles = 0
    ports.fetchProfile.mockImplementation(async (sourceId: string) => {
      activeProfiles += 1
      maxActiveProfiles = Math.max(maxActiveProfiles, activeProfiles)
      await Promise.resolve()
      activeProfiles -= 1
      return { firstName: sourceId, locale: "en_GB" }
    })
    ports.downloadAttachments.mockResolvedValue([
      {
        sourceId: "attachment-1",
        fileType: "image",
        mimeType: "image/png",
        originPath: "public/image.png",
        size: 10,
      },
    ])
    mocks.bulkCreateAttachments.mockImplementation(async ([attachment]) => [
      {
        ...attachment,
        id: "attachment-db-1",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        thumbnailPath: null,
        width: null,
        height: null,
        name: null,
      },
    ])

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items,
      ports,
      options: { now: () => now, profileConcurrency: 1 },
    })

    expect(result).toEqual({
      items: 3,
      dedupedItems: 3,
      contactsCreated: 2,
      messagesInserted: 3,
      duplicatesSkipped: 0,
      attachmentsWritten: 1,
      attachmentFailures: 0,
      perItemFailures: 0,
    })
    expect(mocks.bulkImportChannelContacts).toHaveBeenCalledOnce()
    expect(
      mocks.bulkImportChannelContacts.mock.calls[0][0].contacts,
    ).toHaveLength(3)
    expect(mocks.bulkImportChannelContacts.mock.calls[0][0]).toMatchObject({
      ownerId: "owner-1",
    })
    expect(ports.fetchProfile).toHaveBeenCalledTimes(2)
    expect(maxActiveProfiles).toBe(1)
    expect(mocks.bulkImportChannelContacts.mock.calls[0][0].contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "psid-1",
          firstName: "psid-1",
          locale: "en_GB",
          language: "en",
        }),
        expect.objectContaining({
          sourceId: "psid-2",
          firstName: "psid-2",
          locale: "en_GB",
          language: "en",
        }),
        { sourceId: "psid-3" },
      ]),
    )
    expect(mocks.bulkCreate).toHaveBeenCalledOnce()
    expect(mocks.findManyBySourceIds).toHaveBeenCalledWith(
      expect.objectContaining({ strict: true }),
    )
    expect(mocks.findManyOnWriteShardBySourceIds).toHaveBeenCalledOnce()
    expect(mocks.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      type: "message",
      parentId: null,
      createdAt: now,
    })
    expect(ports.downloadAttachments).toHaveBeenCalledOnce()
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledOnce()
    expect(mocks.bulkUpdateTracking).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({ lastIncomingMessageAt: null }),
      ]),
    })
    expect(mocks.broadcast).toHaveBeenCalledTimes(3)
    expect(mocks.broadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          id: "message-1",
          attachments: [expect.objectContaining({ id: "attachment-db-1" })],
        }),
      }),
      realtimeTarget,
    )
    expect(ports.onTextMessagesPersisted).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        item: expect.objectContaining({ sourceId: "mid-1" }),
        row: expect.objectContaining({ id: "message-1" }),
      }),
      expect.objectContaining({
        contactInboxId: "ci-2",
        conversationId: "conv-2",
        item: expect.objectContaining({ sourceId: "mid-2" }),
        row: expect.objectContaining({ id: "message-2" }),
      }),
    ])
  })

  test("deduplicates duplicate source ids inside the batch", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyBySourceIds.mockResolvedValue([])

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [item("mid-1", "psid-1"), item("mid-1", "psid-1")],
      ports: makePorts(),
      options: { now: () => now },
    })

    expect(result.items).toBe(2)
    expect(result.dedupedItems).toBe(1)
    expect(mocks.bulkCreate.mock.calls[0][0]).toHaveLength(1)
  })

  test("patches a fetched profile after a concurrent bare contact wins the insert race", async () => {
    mocks.findContactInboxesBySourceIds.mockResolvedValue([])
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 1,
      skippedContacts: 0,
      contactInboxIds: new Map([
        ["psid-race", link("race")],
        ["psid-new", link("new")],
      ]),
      newContactInboxIds: new Map([["psid-new", link("new")]]),
    })
    mocks.bulkCreate.mockResolvedValue([
      messageRow("mid-race", "race"),
      messageRow("mid-new", "new"),
    ])
    mocks.findManyBySourceIds.mockResolvedValue([])
    const ports = makePorts()
    ports.fetchProfile.mockImplementation((sourceId: string) =>
      Promise.resolve({
        firstName: sourceId === "psid-race" ? "Race" : "New",
        lastName: "Winner",
        locale: "en_GB",
        timezone: "Europe/London",
      }),
    )

    await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [item("mid-race", "psid-race"), item("mid-new", "psid-new")],
      ports,
      options: { now: () => now },
    })

    expect(mocks.bulkPatchProfiles).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      profiles: [
        expect.objectContaining({
          contactId: "contact-race",
          firstName: "Race",
          lastName: "Winner",
          locale: "en_GB",
          timezone: "Europe/London",
        }),
      ],
    })
  })

  test("persists an empty-payload template echo without attachments or a loop-guard entry", async () => {
    const emptyTemplate = item("mid-template", "psid-1", {
      text: undefined,
      contentType: "text",
      attachments: [],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue([
      { ...messageRow("mid-template", "1"), text: null },
    ])
    mocks.findManyBySourceIds.mockResolvedValue([])
    const ports = makePorts()

    await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [emptyTemplate],
      ports,
      options: { now: () => now },
    })

    expect(mocks.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceId: "mid-template",
        messageType: "outgoing",
        contentType: "text",
        text: undefined,
      }),
    ])
    expect(ports.downloadAttachments).not.toHaveBeenCalled()
    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    expect(mocks.broadcast).toHaveBeenCalledOnce()
    expect(ports.onTextMessagesPersisted).not.toHaveBeenCalled()
  })

  test("finds persisted source ids across strict read shards and the write shard", async () => {
    mocks.findContactInboxesBySourceIds.mockResolvedValue([
      { id: "ci-1", sourceId: "psid-1" },
      { id: "ci-2", sourceId: "psid-2" },
    ])
    mocks.findManyBySourceIds.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([
      messageRow("mid-2", "2"),
    ])
    vi.useFakeTimers()
    vi.setSystemTime(now)

    try {
      const persistedSourceIds =
        await messengerEchoBatchService.findPersistedSourceIds({
          inbox,
          items: [
            item("mid-1", "psid-1"),
            item("mid-2", "psid-2"),
            item("mid-missing", "psid-missing"),
          ],
        })

      expect(persistedSourceIds).toEqual(new Set(["mid-1", "mid-2"]))
      const lookup = {
        workspaceId: "ws-1",
        contactInboxIds: ["ci-1", "ci-2"],
        sourceIds: ["mid-1", "mid-2"],
        sinceTime: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      }
      expect(mocks.findManyBySourceIds).toHaveBeenCalledWith({
        ...lookup,
        strict: true,
      })
      expect(mocks.findManyOnWriteShardBySourceIds).toHaveBeenCalledWith(lookup)
    } finally {
      vi.useRealTimers()
    }
  })

  test("tracks the oldest and newest echo timestamps for one contact inbox", async () => {
    const older = new Date("2026-09-24T22:00:00.000Z")
    const newer = new Date("2026-09-24T23:00:00.000Z")
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([])
    mocks.bulkCreate.mockResolvedValue([
      {
        ...messageRow("mid-old", "1"),
        id: "message-old",
        createdAt: older,
      },
      {
        ...messageRow("mid-new", "1"),
        id: "message-new",
        createdAt: newer,
      },
    ])

    await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [
        item("mid-new", "psid-1", { createdAt: newer }),
        item("mid-old", "psid-1", { createdAt: older }),
      ],
      ports: makePorts(),
      options: { now: () => now },
    })

    expect(mocks.bulkUpdateTracking).toHaveBeenCalledWith({
      rows: [
        {
          contactInboxId: "ci-1",
          contactId: "contact-1",
          workspaceId: "ws-1",
          firstInteractionAt: older,
          lastMessageAt: newer,
          lastIncomingMessageAt: null,
        },
      ],
    })
    expect(mocks.bulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      rows: [
        {
          conversationId: "conv-1",
          newestMessageAt: newer,
          aiMarkerMessageId: null,
        },
      ],
    })
  })

  test("resolves a boundary-timestamped replay one hour later", async () => {
    const replayNow = new Date(now.getTime() + 60 * 60 * 1000)
    const boundaryCreatedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const existingRow = {
      ...messageRow("mid-1", "1"),
      createdAt: boundaryCreatedAt,
    }
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([existingRow])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([existingRow])

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [item("mid-1", "psid-1", { createdAt: boundaryCreatedAt })],
      ports: makePorts(),
      options: { now: () => replayNow },
    })

    const expectedSinceTime = new Date(
      replayNow.getTime() - 8 * 24 * 60 * 60 * 1000,
    )
    expect(mocks.findManyBySourceIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxIds: ["ci-1"],
      sourceIds: ["mid-1"],
      sinceTime: expectedSinceTime,
      strict: true,
    })
    expect(mocks.findManyOnWriteShardBySourceIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxIds: ["ci-1"],
      sourceIds: ["mid-1"],
      sinceTime: expectedSinceTime,
    })
    expect(result.duplicatesSkipped).toBe(1)
    expect(mocks.bulkCreate).not.toHaveBeenCalled()
    expect(mocks.bulkUpdateTracking).toHaveBeenCalledWith({
      rows: [
        {
          contactInboxId: "ci-1",
          contactId: "contact-1",
          workspaceId: "ws-1",
          firstInteractionAt: boundaryCreatedAt,
          lastMessageAt: boundaryCreatedAt,
          lastIncomingMessageAt: null,
        },
      ],
    })
    expect(mocks.bulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      rows: [
        {
          conversationId: "conv-1",
          newestMessageAt: boundaryCreatedAt,
          aiMarkerMessageId: null,
        },
      ],
    })
  })

  test("replay writes only descriptors missing from a batch-owned attachment set", async () => {
    const replayItem = item("mid-1", "psid-1", {
      attachments: [
        { sourceId: "attachment-existing", type: "image" },
        { sourceId: "attachment-missing", type: "file" },
      ],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([
      messageRow("mid-1", "1"),
    ])
    mocks.findAttachmentSourceIdsByMessageIds.mockResolvedValue([
      {
        messageId: "message-1",
        messageCreatedAt: now,
        sourceId: "attachment-existing",
      },
    ])
    const ports = makePorts()
    ports.downloadAttachments.mockResolvedValue([
      {
        sourceId: "attachment-missing",
        fileType: "file",
        mimeType: "application/pdf",
        originPath: "public/missing.pdf",
        size: 20,
      },
    ])
    mocks.bulkCreateAttachments.mockImplementation(async (attachments) =>
      attachments.map((attachment) => ({
        ...attachment,
        id: "attachment-db-missing",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        thumbnailPath: null,
        width: null,
        height: null,
        name: null,
      })),
    )

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [replayItem],
      ports,
      options: { now: () => now },
    })

    expect(result.messagesInserted).toBe(0)
    expect(result.duplicatesSkipped).toBe(1)
    expect(result.attachmentsWritten).toBe(1)
    expect(mocks.bulkCreate).not.toHaveBeenCalled()
    expect(ports.downloadAttachments).toHaveBeenCalledExactlyOnceWith({
      ...replayItem,
      attachments: [{ sourceId: "attachment-missing", type: "file" }],
    })
    expect(mocks.bulkCreateAttachments.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        messageId: "message-1",
        sourceId: "attachment-missing",
      }),
    ])
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(ports.onTextMessagesPersisted).not.toHaveBeenCalled()
    expect(mocks.bulkUpdateTracking).toHaveBeenCalledOnce()
    expect(mocks.bulkAdvanceActivityAndAiContextMarker).toHaveBeenCalledOnce()
  })

  test("replay leaves legacy-owned attachments untouched", async () => {
    const replayItem = item("mid-1", "psid-1", {
      attachments: [
        { sourceId: "attachment-1", type: "image" },
        { sourceId: "attachment-2", type: "file" },
      ],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([
      messageRow("mid-1", "1"),
    ])
    mocks.findAttachmentSourceIdsByMessageIds.mockResolvedValue([
      {
        messageId: "message-1",
        messageCreatedAt: now,
        sourceId: "legacy-random-id",
      },
    ])
    const ports = makePorts()

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [replayItem],
      ports,
      options: { now: () => now },
    })

    expect(result.attachmentsWritten).toBe(0)
    expect(ports.downloadAttachments).not.toHaveBeenCalled()
    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
  })

  test("replay writes every attachment when the existing message has none", async () => {
    const replayItem = item("mid-1", "psid-1", {
      attachments: [
        { sourceId: "attachment-1", type: "image" },
        { sourceId: "attachment-2", type: "file" },
      ],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([
      messageRow("mid-1", "1"),
    ])
    mocks.findAttachmentSourceIdsByMessageIds.mockResolvedValue([])
    mocks.bulkCreateAttachments.mockImplementation(async (attachments) =>
      attachments.map((attachment, index) => ({
        ...attachment,
        id: `attachment-db-${index + 1}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        thumbnailPath: null,
        width: null,
        height: null,
        name: null,
      })),
    )
    const ports = makePorts()
    ports.downloadAttachments.mockImplementation((downloadItem) =>
      Promise.resolve(
        downloadItem.attachments.map(({ sourceId, type }) => ({
          sourceId,
          fileType: type,
          mimeType: type === "image" ? "image/png" : "application/pdf",
          originPath: `public/${sourceId}`,
          size: 10,
        })),
      ),
    )

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [replayItem],
      ports,
      options: { now: () => now },
    })

    expect(result.attachmentsWritten).toBe(2)
    expect(ports.downloadAttachments).toHaveBeenCalledTimes(2)
    expect(ports.downloadAttachments).toHaveBeenNthCalledWith(1, {
      ...replayItem,
      attachments: [{ sourceId: "attachment-1", type: "image" }],
    })
    expect(ports.downloadAttachments).toHaveBeenNthCalledWith(2, {
      ...replayItem,
      attachments: [{ sourceId: "attachment-2", type: "file" }],
    })
    expect(mocks.bulkCreateAttachments.mock.calls[0][0]).toHaveLength(2)
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(ports.onTextMessagesPersisted).not.toHaveBeenCalled()
  })

  test("does not repair attachments for a message found only across read shards", async () => {
    const replayItem = item("mid-1", "psid-1", {
      attachments: [{ sourceId: "attachment-1", type: "image" }],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([messageRow("mid-1", "1")])

    const ports = makePorts()
    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [replayItem],
      ports,
      options: { now: () => now },
    })

    expect(result.duplicatesSkipped).toBe(1)
    expect(result.attachmentsWritten).toBe(0)
    expect(mocks.findAttachmentSourceIdsByMessageIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      messages: [],
    })
    expect(ports.downloadAttachments).not.toHaveBeenCalled()
    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
  })

  test("keeps a bare contact when profile fetch fails", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 1,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map([["psid-1", link("1")]]),
    })
    mocks.bulkCreate.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyBySourceIds.mockResolvedValue([])
    mocks.findContactInboxesBySourceIds.mockResolvedValue([])
    const ports = makePorts()
    ports.fetchProfile.mockRejectedValue(new Error("profile unavailable"))

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [item("mid-1", "psid-1")],
      ports,
      options: { now: () => now },
    })

    expect(result.perItemFailures).toBe(0)
    expect(mocks.bulkImportChannelContacts).toHaveBeenCalledWith(
      expect.objectContaining({ contacts: [{ sourceId: "psid-1" }] }),
    )
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("profile"),
    )
  })

  test("drops a failed attachment download without poisoning the flush", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([
        ["psid-1", link("1")],
        ["psid-2", link("2")],
      ]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue([
      messageRow("mid-1", "1"),
      messageRow("mid-2", "2"),
    ])
    mocks.findManyBySourceIds.mockResolvedValue([])
    mocks.bulkCreateAttachments.mockResolvedValue([
      {
        id: "attachment-db-2",
        messageId: "message-2",
        messageCreatedAt: now,
      },
    ])
    const ports = makePorts()
    ports.downloadAttachments.mockImplementation((downloadItem) => {
      if (downloadItem.sourceId === "mid-1") {
        return Promise.reject(new Error("CDN unavailable"))
      }
      return Promise.resolve([
        {
          sourceId: "attachment-2",
          fileType: "image",
          mimeType: "image/png",
          originPath: "public/image.png",
          size: 10,
        },
      ])
    })

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [
        item("mid-1", "psid-1", {
          attachments: [{ sourceId: "attachment-1" }],
        }),
        item("mid-2", "psid-2", {
          attachments: [{ sourceId: "attachment-2" }],
        }),
      ],
      ports,
      options: { now: () => now },
    })

    expect(result.attachmentFailures).toBe(1)
    expect(result.attachmentsWritten).toBe(1)
    expect(ports.fallbackToSingleEvent).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        sourceId: "mid-1",
        workspaceId: "ws-1",
      }),
      expect.stringContaining("attachment download failed"),
    )
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({ sourceId: "attachment-2" }),
    ])
    expect(mocks.broadcast).toHaveBeenCalledTimes(2)
    expect(ports.onTextMessagesPersisted).toHaveBeenCalledOnce()
  })

  test("writes successful attachments and counts missing partial-download descriptors", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyBySourceIds.mockResolvedValue([])
    mocks.bulkCreateAttachments.mockResolvedValue([
      {
        id: "attachment-db-1",
        messageId: "message-1",
        messageCreatedAt: now,
      },
    ])
    const ports = makePorts()
    ports.downloadAttachments.mockImplementation((downloadItem) =>
      downloadItem.attachments[0]?.sourceId === "attachment-expired"
        ? Promise.reject(new Error("attachment expired"))
        : Promise.resolve([
            {
              sourceId: "attachment-ok",
              fileType: "image",
              mimeType: "image/png",
              originPath: "public/image.png",
              size: 10,
            },
          ]),
    )

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [
        item("mid-1", "psid-1", {
          attachments: [
            { sourceId: "attachment-ok" },
            { sourceId: "attachment-expired" },
          ],
        }),
      ],
      ports,
      options: { now: () => now },
    })

    expect(result.attachmentFailures).toBe(1)
    expect(result.attachmentsWritten).toBe(1)
    expect(ports.fallbackToSingleEvent).not.toHaveBeenCalled()
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({ sourceId: "attachment-ok" }),
    ])
  })

  test("bounds downloads across descriptors instead of messages", async () => {
    const items = ["1", "2", "3"].map((suffix) =>
      item(`mid-${suffix}`, `psid-${suffix}`, {
        attachments: ["1", "2", "3", "4"].map((attachmentSuffix) => ({
          sourceId: `attachment-${suffix}-${attachmentSuffix}`,
          type: "image",
        })),
      }),
    )
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map(
        ["1", "2", "3"].map((suffix) => [`psid-${suffix}`, link(suffix)]),
      ),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue(
      ["1", "2", "3"].map((suffix) => messageRow(`mid-${suffix}`, suffix)),
    )
    mocks.findManyBySourceIds.mockResolvedValue([])
    const ports = makePorts()
    let activeDownloads = 0
    let maxActiveDownloads = 0
    let releaseDownloads: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseDownloads = resolve
    })
    ports.downloadAttachments.mockImplementation(async (downloadItem) => {
      activeDownloads += 1
      maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads)
      await gate
      activeDownloads -= 1
      const [descriptor] = downloadItem.attachments
      return descriptor
        ? [
            {
              sourceId: descriptor.sourceId,
              fileType: "image",
              mimeType: "image/png",
              originPath: `public/${descriptor.sourceId}`,
              size: 10,
            },
          ]
        : []
    })

    const processing = messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items,
      ports,
      options: { now: () => now, attachmentConcurrency: 2 },
    })

    await vi.waitFor(() => {
      expect(ports.downloadAttachments).toHaveBeenCalledTimes(2)
    })
    expect(maxActiveDownloads).toBe(2)
    releaseDownloads?.()
    await processing

    expect(ports.downloadAttachments).toHaveBeenCalledTimes(12)
    expect(maxActiveDownloads).toBe(2)
    expect(
      ports.downloadAttachments.mock.calls.every(
        ([downloadItem]) => downloadItem.attachments.length === 1,
      ),
    ).toBe(true)
  })

  test("scopes existing attachments by message id and createdAt", async () => {
    const later = new Date(now.getTime() + 1000)
    const firstMessage = messageRow("mid-1", "1")
    const secondMessage = {
      ...messageRow("mid-2", "2"),
      id: firstMessage.id,
      createdAt: later,
      updatedAt: later,
    }
    const firstItem = item("mid-1", "psid-1", {
      attachments: [{ sourceId: "attachment-shared", type: "image" }],
    })
    const secondItem = item("mid-2", "psid-2", {
      createdAt: later,
      attachments: [{ sourceId: "attachment-shared", type: "image" }],
    })
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([
        ["psid-1", link("1")],
        ["psid-2", link("2")],
      ]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockResolvedValue([firstMessage, secondMessage])
    mocks.findManyOnWriteShardBySourceIds.mockResolvedValue([
      firstMessage,
      secondMessage,
    ])
    mocks.findAttachmentSourceIdsByMessageIds.mockResolvedValue([
      {
        messageId: firstMessage.id,
        messageCreatedAt: firstMessage.createdAt,
        sourceId: "attachment-shared",
      },
    ])
    const ports = makePorts()
    ports.downloadAttachments.mockResolvedValue([
      {
        sourceId: "attachment-shared",
        fileType: "image",
        mimeType: "image/png",
        originPath: "public/shared.png",
        size: 10,
      },
    ])
    mocks.bulkCreateAttachments.mockImplementation(async (attachments) =>
      attachments.map((attachment) => ({
        ...attachment,
        createdAt: later,
        updatedAt: later,
        deletedAt: null,
        thumbnailPath: null,
      })),
    )

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [firstItem, secondItem],
      ports,
      options: { now: () => later },
    })

    expect(result.attachmentsWritten).toBe(1)
    expect(ports.downloadAttachments).toHaveBeenCalledExactlyOnceWith({
      ...secondItem,
      attachments: [{ sourceId: "attachment-shared", type: "image" }],
    })
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: secondMessage.id,
        messageCreatedAt: secondMessage.createdAt,
        sourceId: "attachment-shared",
      }),
    ])
    expect(mocks.findAttachmentSourceIdsByMessageIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      messages: [
        {
          messageId: firstMessage.id,
          messageCreatedAt: firstMessage.createdAt,
        },
        {
          messageId: secondMessage.id,
          messageCreatedAt: secondMessage.createdAt,
        },
      ],
    })
  })

  test("falls back only the item whose contact link could not be resolved", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockResolvedValue([messageRow("mid-1", "1")])
    mocks.findManyBySourceIds.mockResolvedValue([])
    const ports = makePorts()

    const result = await messengerEchoBatchService.process({
      inbox,
      ownerId: "owner-1",
      realtimeTarget,
      items: [item("mid-1", "psid-1"), item("mid-2", "psid-missing")],
      ports,
      options: { now: () => now },
    })

    expect(result.messagesInserted).toBe(1)
    expect(result.perItemFailures).toBe(1)
    expect(ports.fallbackToSingleEvent).toHaveBeenCalledOnce()
    expect(ports.fallbackToSingleEvent.mock.calls[0][0].sourceId).toBe("mid-2")
  })

  test("propagates a batch-level message insert failure", async () => {
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.bulkCreate.mockRejectedValue(new Error("shard unavailable"))
    mocks.findManyBySourceIds.mockResolvedValue([])
    const ports = makePorts()

    await expect(
      messengerEchoBatchService.process({
        inbox,
        ownerId: "owner-1",
        realtimeTarget,
        items: [item("mid-1", "psid-1")],
        ports,
        options: { now: () => now },
      }),
    ).rejects.toThrow("shard unavailable")

    expect(ports.fallbackToSingleEvent).not.toHaveBeenCalled()
  })

  test("propagates a dedup lookup failure without inserting messages", async () => {
    const error = new Error("historical shard unavailable")
    mocks.bulkImportChannelContacts.mockResolvedValue({
      importedContacts: 0,
      skippedContacts: 0,
      contactInboxIds: new Map([["psid-1", link("1")]]),
      newContactInboxIds: new Map(),
    })
    mocks.findManyBySourceIds.mockRejectedValue(error)
    const ports = makePorts()

    await expect(
      messengerEchoBatchService.process({
        inbox,
        ownerId: "owner-1",
        realtimeTarget,
        items: [item("mid-1", "psid-1")],
        ports,
        options: { now: () => now },
      }),
    ).rejects.toBe(error)

    expect(mocks.bulkCreate).not.toHaveBeenCalled()
    expect(ports.fallbackToSingleEvent).not.toHaveBeenCalled()
  })
})
