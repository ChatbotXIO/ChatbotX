import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn().mockResolvedValue(undefined),
  findBySourceId: vi.fn(),
  findContactInbox: vi.fn(),
  identifyIntegration: vi.fn(),
  runChannelHandler: vi.fn(),
  runFlowPostback: vi.fn().mockResolvedValue(undefined),
  settleFailedOutgoingMessage: vi.fn().mockResolvedValue("removed"),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
  conversationService: { markReadByContact: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi
    .fn()
    .mockResolvedValue({ findBySourceId: mocks.findBySourceId }),
  getSafeSinceTime: vi.fn(() => new Date(0)),
  contactInboxRepository: {
    findWithConversationAndContact: mocks.findContactInbox,
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mocks.emit }))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
  resolveSourceScopedIdentityMatch: async (
    identity: { sourceId: string },
    lookup: (where: { sourceId: string }) => Promise<unknown>,
  ) => {
    const row = await lookup({ sourceId: identity.sourceId })
    return row ? { row, matchedBy: "sourceId" as const } : undefined
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { messageStatus: "messageStatus" },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: { whatsapp: { runChannelHandler: mocks.runChannelHandler } },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mocks.identifyIntegration,
  },
}))

vi.mock("../src/integration/handlers/flow", () => ({
  runFlowPostback: mocks.runFlowPostback,
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  settleFailedOutgoingMessage: mocks.settleFailedOutgoingMessage,
}))

const { handleMessageStatus } = await import(
  "../src/integration/handlers/message-status"
)

const createdAt = new Date("2026-11-18T08:00:00.000Z")

const storedMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  conversationId: "conv-1",
  messageType: "outgoing",
  createdAt,
  sourceId: "wamid-1",
  contentAttributes: {},
  ...overrides,
})

const failedStatus = (error: unknown = { message: "Recipient not on WA" }) =>
  handleMessageStatus({
    integrationType: "whatsapp",
    integrationIdentifier: "phone-number-1",
    payload: { messageId: "wamid-1", status: "failed", error },
  } as never)

describe("handleMessageStatus — a provider reports a send failed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.identifyIntegration.mockResolvedValue({
      inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "whatsapp" },
      integrationRow: { id: "integration-1" },
    })
    mocks.runChannelHandler.mockResolvedValue({
      contact: { sourceId: "contact-source-1" },
    })
    mocks.findContactInbox.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
      sourceId: "contact-source-1",
      lastMessageAt: null,
      conversation: { id: "conv-1", workspaceId: "ws-1" },
      contact: { id: "contact-1" },
    })
    mocks.findBySourceId.mockResolvedValue(storedMessage())
  })

  test("emits message:failed, then settles the message by the shared rule", async () => {
    await failedStatus()

    expect(mocks.emit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ willRetry: false }),
    )
    expect(mocks.settleFailedOutgoingMessage).toHaveBeenCalledWith({
      message: expect.objectContaining({ id: "msg-1" }),
      conversationId: "conv-1",
      workspaceId: "ws-1",
      errorMessage: "Recipient not on WA",
      silent: false,
    })
  })

  test("falls back to a generic error text when the provider gives none", async () => {
    await failedStatus({})

    expect(mocks.settleFailedOutgoingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "The channel reported that the message was not delivered",
      }),
    )
  })

  test("settles a broadcast message silently", async () => {
    mocks.findBySourceId.mockResolvedValue(
      storedMessage({
        contentAttributes: { metadata: { type: "broadcast" } },
      }),
    )

    await failedStatus()

    expect(mocks.settleFailedOutgoingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true }),
    )
  })

  test("runs a template's Failed status branch before settling", async () => {
    mocks.findBySourceId.mockResolvedValue(
      storedMessage({
        contentAttributes: {
          type: "whatsapp_template",
          payload: {
            buttons: [{ id: "b-1", label: "Failed", postback: "flow:pb" }],
          },
        },
      }),
    )
    const order: string[] = []
    mocks.runFlowPostback.mockImplementationOnce(() => {
      order.push("postback")
      return Promise.resolve()
    })
    mocks.settleFailedOutgoingMessage.mockImplementationOnce(() => {
      order.push("settle")
      return Promise.resolve("removed")
    })

    await failedStatus()

    expect(order).toEqual(["postback", "settle"])
  })

  test("a status branch that throws leaves the message for the retry", async () => {
    mocks.findBySourceId.mockResolvedValue(
      storedMessage({
        contentAttributes: {
          type: "whatsapp_template",
          payload: {
            buttons: [{ id: "b-1", label: "Failed", postback: "flow:pb" }],
          },
        },
      }),
    )
    mocks.runFlowPostback.mockRejectedValueOnce(new Error("queue down"))

    await expect(failedStatus()).rejects.toThrow("queue down")
    expect(mocks.settleFailedOutgoingMessage).not.toHaveBeenCalled()
  })

  test("never settles a delivered message", async () => {
    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: { messageId: "wamid-1", status: "delivered" },
    } as never)

    expect(mocks.settleFailedOutgoingMessage).not.toHaveBeenCalled()
  })
})
