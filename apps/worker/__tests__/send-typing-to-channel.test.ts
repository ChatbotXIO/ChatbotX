import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findLastIncomingMessageSourceId: vi.fn(),
  runChannelHandler: vi.fn().mockResolvedValue(undefined),
  resolveIntegrationContextFromContactInbox: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findLastIncomingMessageSourceId: mocks.findLastIncomingMessageSourceId,
  },
  contactInboxService: {},
  contactService: {},
}))
vi.mock("@chatbotx.io/database/client", () => ({ db: {}, eq: vi.fn() }))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: { messenger: {}, whatsapp: {} },
  resolveIntegrationContextFromContactInbox:
    mocks.resolveIntegrationContextFromContactInbox,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { sendTypingToChannel } = await import(
  "../src/chat/handlers/send-message"
)

const conversation = { id: "conv-1", workspaceId: "ws-1" } as never

describe("sendTypingToChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler: mocks.runChannelHandler },
      ctx: {},
    })
  })

  test("WhatsApp typing anchors on the newest incoming wamid", async () => {
    mocks.findLastIncomingMessageSourceId.mockResolvedValue("wamid.abc")
    const contactInbox = { id: "ci-1", channel: "whatsapp" } as never

    await sendTypingToChannel({ conversation, contactInbox, typing: true })

    expect(mocks.findLastIncomingMessageSourceId).toHaveBeenCalledWith({
      conversation,
      contactInboxId: "ci-1",
    })
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "sendTyping",
      {
        ctx: {},
        data: {
          contact: contactInbox,
          typing: true,
          seconds: undefined,
          messageSourceId: "wamid.abc",
        },
      },
    )
  })

  test("other channels skip the lookup", async () => {
    const contactInbox = { id: "ci-1", channel: "messenger" } as never

    await sendTypingToChannel({ conversation, contactInbox, typing: true })

    expect(mocks.findLastIncomingMessageSourceId).not.toHaveBeenCalled()
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "sendTyping",
      expect.objectContaining({
        data: expect.objectContaining({ messageSourceId: undefined }),
      }),
    )
  })
})
