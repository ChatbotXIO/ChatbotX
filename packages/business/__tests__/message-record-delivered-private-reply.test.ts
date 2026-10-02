// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockRepositoryCreate = vi.fn()
const mockCreateMessageRepository = vi.fn()
const mockFindDMByContact = vi.fn()
const mockFindOrCreate = vi.fn()
const mockRecordOutboundMessageActivity = vi.fn()
const mockConversationInvalidate = vi.fn()
const mockMarkReadByOutbound = vi.fn()
const mockRecordOutboundMessageSent = vi.fn()
const mockInvalidateTracking = vi.fn()
const mockUnblockIfBlocked = vi.fn()
const mockPublishToWorkspaceParty = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    findDMByContact: mockFindDMByContact,
    findOrCreate: mockFindOrCreate,
    recordOutboundMessageActivity: mockRecordOutboundMessageActivity,
    invalidate: mockConversationInvalidate,
    markReadByOutbound: mockMarkReadByOutbound,
  },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    recordOutboundMessageSent: mockRecordOutboundMessageSent,
    invalidateTracking: mockInvalidateTracking,
  },
}))

vi.mock("../src/contact/service", () => ({
  contactService: { unblockIfBlocked: mockUnblockIfBlocked },
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mockPublishToWorkspaceParty,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}))

const { recordDeliveredPrivateReply } = await import(
  "../src/message/record-delivered-private-reply"
)

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
} as never

const createdAt = new Date("2026-09-28T10:00:00.000Z")

const record = () =>
  recordDeliveredPrivateReply({
    workspaceId: "ws-1",
    contactInbox,
    text: "private answer",
    sourceId: "mid-1",
  })

describe("recordDeliveredPrivateReply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMessageRepository.mockResolvedValue({
      create: mockRepositoryCreate,
    })
    mockRepositoryCreate.mockImplementation(async (input) => ({
      id: "msg-1",
      ...input,
      createdAt,
    }))
    mockFindDMByContact.mockResolvedValue({ id: "dm-1" })
    mockFindOrCreate.mockResolvedValue({ id: "dm-created" })
    mockRecordOutboundMessageActivity.mockResolvedValue({ contactId: "c" })
    mockConversationInvalidate.mockResolvedValue(undefined)
    mockMarkReadByOutbound.mockResolvedValue(true)
    mockRecordOutboundMessageSent.mockResolvedValue(null)
    mockInvalidateTracking.mockResolvedValue(undefined)
    mockUnblockIfBlocked.mockResolvedValue(null)
  })

  test("writes onto the contact's existing DM conversation", async () => {
    const message = await record()

    expect(mockFindOrCreate).not.toHaveBeenCalled()
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "dm-1",
        contactInboxId: "ci-1",
        messageType: "outgoing",
        senderType: "bot",
        sourceId: "mid-1",
        text: "private answer",
        contentAttributes: { isPrivateReply: true },
      }),
    )
    expect(message).toMatchObject({ id: "msg-1", conversationId: "dm-1" })
  })

  test("creates the DM conversation for a contact's first interaction", async () => {
    mockFindDMByContact.mockResolvedValue(undefined)

    await record()

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sourceId: null,
    })
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "dm-created" }),
    )
  })

  test("writes nothing when the DM conversation cannot be resolved", async () => {
    mockFindDMByContact.mockRejectedValue(new Error("db blip"))

    await expect(record()).resolves.toBeNull()

    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockPublishToWorkspaceParty).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalled()
  })

  test("runs the delivered-DM bookkeeping of the chat pipeline", async () => {
    await record()

    expect(mockRecordOutboundMessageActivity).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "dm-1", at: createdAt }),
    )
    expect(mockInvalidateTracking).toHaveBeenCalledWith({ contactId: "c" })
    expect(mockConversationInvalidate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["dm-1"],
    })
    expect(mockRecordOutboundMessageSent).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: createdAt,
    })
    expect(mockMarkReadByOutbound).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "dm-1",
      inboxId: "inbox-1",
      readAt: createdAt,
    })
    expect(mockUnblockIfBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
    expect(mockPublishToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "messageCreated",
      data: expect.objectContaining({ id: "msg-1" }),
      route: { assignedTeamIds: [], assignedUserIds: [] },
    })
  })

  test("a failing mark-read or unblock still returns the row and pushes it", async () => {
    mockMarkReadByOutbound.mockRejectedValue(new Error("read failed"))
    mockUnblockIfBlocked.mockRejectedValue(new Error("unblock failed"))

    const message = await record()

    expect(message).toMatchObject({ id: "msg-1" })
    expect(mockPublishToWorkspaceParty).toHaveBeenCalled()
  })

  test("never throws when the insert fails", async () => {
    mockRepositoryCreate.mockRejectedValue(new Error("shard down"))

    await expect(record()).resolves.toBeNull()
  })
})
