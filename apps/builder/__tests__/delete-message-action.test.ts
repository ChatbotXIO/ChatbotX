import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockBroadcastToWorkspaceParty,
  mockChatQueueAdd,
  mockContactInboxFindBy,
  mockConversationFindByOrFail,
  mockDeleteById,
  mockDeleteBySourceId,
  mockFindById,
} = vi.hoisted(() => ({
  mockBroadcastToWorkspaceParty: vi.fn().mockResolvedValue(undefined),
  mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockContactInboxFindBy: vi.fn(),
  mockConversationFindByOrFail: vi.fn(),
  mockDeleteById: vi.fn(),
  mockDeleteBySourceId: vi.fn(),
  mockFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mockBroadcastToWorkspaceParty,
  contactInboxService: { findBy: mockContactInboxFindBy },
  conversationService: { findByOrFail: mockConversationFindByOrFail },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    findById: mockFindById,
    deleteById: mockDeleteById,
    deleteBySourceId: mockDeleteBySourceId,
  }),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageDeleted: "messageDeleted" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { deleteChannelMessage: "deleteChannelMessage" },
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

const { deleteMessage } = await import(
  "../src/features/messages/actions/delete-message.action"
)

const createdAt = new Date("2026-01-01T00:00:00Z")

describe("deleteMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastToWorkspaceParty.mockResolvedValue(undefined)
    mockConversationFindByOrFail.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
  })

  test("broadcasts messageDeleted with the deleted message ids", async () => {
    mockFindById.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
      createdAt,
      sourceId: null,
      contactInboxId: null,
    })
    mockDeleteById.mockResolvedValue([{ id: "msg-1" }])

    await deleteMessage({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: { id: "msg-1", createdAt },
    })

    expect(mockBroadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "messageDeleted",
      data: { messageIds: ["msg-1"] },
    })
  })

  test("queues a channel deletion job when the message has a sourceId", async () => {
    mockFindById.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
      createdAt,
      sourceId: "source-1",
      contactInboxId: "ci-1",
    })
    mockDeleteBySourceId.mockResolvedValue([{ id: "msg-1" }, { id: "msg-2" }])
    mockContactInboxFindBy.mockResolvedValue({ id: "ci-1" })

    await deleteMessage({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: { id: "msg-1", createdAt },
    })

    expect(mockBroadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "messageDeleted",
      data: { messageIds: ["msg-1", "msg-2"] },
    })
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "deleteChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          message: { id: "msg-1", createdAt },
        }),
      }),
    )
  })

  test("throws when the message does not belong to the conversation", async () => {
    mockFindById.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-other",
      createdAt,
      sourceId: null,
      contactInboxId: null,
    })

    await expect(
      deleteMessage({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        parsedInput: { id: "msg-1", createdAt },
      }),
    ).rejects.toThrow("Comment not found")

    expect(mockBroadcastToWorkspaceParty).not.toHaveBeenCalled()
  })
})
