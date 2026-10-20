import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockQueueWorkspaceRealtimeEvent,
  mockChatQueueAdd,
  mockContactInboxFindByIdForWorkspace,
  mockConversationFindByOrFail,
  mockEditMessage,
  mockFindById,
} = vi.hoisted(() => ({
  mockQueueWorkspaceRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockContactInboxFindByIdForWorkspace: vi.fn(),
  mockConversationFindByOrFail: vi.fn(),
  mockEditMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
  mockFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  queueWorkspaceRealtimeEvent: mockQueueWorkspaceRealtimeEvent,
  contactInboxService: {
    findByIdForWorkspace: mockContactInboxFindByIdForWorkspace,
  },
  conversationService: { findByOrFail: mockConversationFindByOrFail },
  messageService: {
    edit: mockEditMessage,
    findWithAttachments: mockFindById,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  getImageDimensions: vi.fn(),
  uploader: { getObject: vi.fn() },
}))

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageUpdated: "messageUpdated" },
  // The mocked conversation below carries no assignedUserId/assignedInboxTeamId,
  // so the real routeForConversation would resolve to this same empty route —
  // hardcoding it here keeps this test independent of that function's own
  // (separately tested) logic.
  routeForConversation: () => ({ assignedTeamIds: [], assignedUserIds: [] }),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { editChannelMessage: "editChannelMessage" },
  chatQueue: { add: mockChatQueueAdd },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: (fn: (...args: any[]) => any) => fn,
      }),
    }),
  },
}))

const { editMessage } = await import(
  "../src/features/messages/actions/edit-message.action"
)

const createdAt = new Date("2026-01-01T00:00:00Z")

describe("editMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueueWorkspaceRealtimeEvent.mockResolvedValue(undefined)
    mockConversationFindByOrFail.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mockContactInboxFindByIdForWorkspace.mockResolvedValue({ id: "ci-1" })
    mockFindById.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
      createdAt,
      messageType: "outgoing",
      type: "comment",
      contactInboxId: "ci-1",
    })
  })

  test("broadcasts messageUpdated with the new text and no attachment change", async () => {
    await editMessage({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: {
        messageId: "msg-1",
        createdAt,
        newText: "updated text",
      } as never,
    })

    expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalledWith("ws-1", {
      eventType: "messageUpdated",
      data: {
        messageId: "msg-1",
        newText: "updated text",
        newAttachmentPath: null,
        newAttachmentPublicUrl: null,
        newAttachmentMimeType: null,
        newAttachmentWidth: 0,
        newAttachmentHeight: 0,
        removedAttachment: false,
      },
      route: { assignedTeamIds: [], assignedUserIds: [] },
    })

    expect(mockEditMessage).toHaveBeenCalledWith({
      id: "msg-1",
      workspaceId: "ws-1",
      text: "updated text",
      createdAt,
      attachments: [],
      replaceAttachments: false,
    })
  })

  test("broadcasts removedAttachment: true when the caller removes the attachment", async () => {
    await editMessage({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: {
        messageId: "msg-1",
        createdAt,
        newText: "updated text",
        removeAttachment: true,
      } as never,
    })

    expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageUpdated",
        data: expect.objectContaining({ removedAttachment: true }),
      }),
    )
  })

  test("throws and does not broadcast when the message is not an editable comment", async () => {
    mockFindById.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
      createdAt,
      messageType: "incoming",
      type: "comment",
      contactInboxId: "ci-1",
    })

    await expect(
      editMessage({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        parsedInput: {
          messageId: "msg-1",
          createdAt,
          newText: "updated text",
        } as never,
      }),
    ).rejects.toThrow("Message is not an editable comment")

    expect(mockQueueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
  })
})
