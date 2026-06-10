import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEmit,
  mockResolveIntegrationContextFromContactInbox,
  mockRunChannelHandler,
  mockDbUpdate,
} = vi.hoisted(() => {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }

  return {
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockResolveIntegrationContextFromContactInbox: vi.fn(),
    mockRunChannelHandler: vi.fn().mockResolvedValue({ messageIds: ["mid-1"] }),
    mockDbUpdate: vi.fn().mockReturnValue(updateChain),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  whatsappFlowModel: { id: "id", sourceId: "sourceId" },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {},
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
}))

const { sendFlowStepToChannel, sendMessageToChannel } = await import(
  "../src/chat/handlers/send-message"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "messenger",
  contactId: "contact-1",
  sourceId: "psid-1",
  source: "messenger",
}

describe("chat send-message handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunChannelHandler.mockResolvedValue({ messageIds: ["mid-1"] })
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      ctx: { workspaceId: "ws-1" },
      integration: {
        runChannelHandler: mockRunChannelHandler,
      },
    })
  })

  test("passes sendFrom to sendMessage channel handler", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "hello",
      } as never,
      sendFrom: "inbox",
    })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "message",
      "sendMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          sendFrom: "inbox",
        }),
      }),
    )
  })

  test("passes sendFrom to sendFlowStep channel handler", async () => {
    await sendFlowStepToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      flowId: "flow-1",
      step: {
        id: "step-1",
        nodeId: "node-1",
        stepType: "sendText",
        text: "hello",
      } as never,
      sendFrom: "inbox",
    })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "message",
      "sendFlowStep",
      expect.objectContaining({
        data: expect.objectContaining({
          sendFrom: "inbox",
        }),
      }),
    )
  })

  test("does not throw non-retryable ChannelError after emitting failure", async () => {
    const error = new ChannelError(
      "expired human agent window",
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: "messenger_human_agent_window_expired" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).resolves.toBeUndefined()

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })

  test("throws retryable ChannelError after emitting failure", async () => {
    const error = new ChannelError(
      "rate limited",
      ChannelErrorCategory.RATE_LIMITED,
      { code: "rate_limited" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).rejects.toBe(error)

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })

  test("does not retry missing integration auth resolution errors", async () => {
    const error = new ChannelError(
      "Unable to find integration auth for channel: messenger",
      ChannelErrorCategory.AUTH_FAILED,
      { code: "integration_auth_missing" },
    )
    mockResolveIntegrationContextFromContactInbox.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).resolves.toBeUndefined()

    expect(mockRunChannelHandler).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })
})
