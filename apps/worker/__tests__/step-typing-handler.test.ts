import { beforeEach, describe, expect, test, vi } from "vitest"

const mockFindLatestIncomingMessage = vi.fn()
const mockFindRecentByContactId = vi.fn()
const mockRunChannelHandler = vi.fn()
const mockResolveIntegrationContext = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findRecentByContactId: (...args: unknown[]) =>
      mockFindRecentByContactId(...args),
  },
  messageService: {
    findLatestIncomingMessage: (...args: unknown[]) =>
      mockFindLatestIncomingMessage(...args),
  },
  conversationService: {},
  inboxTeamService: {},
  workspaceMemberService: {},
  contactService: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: vi.fn(),
  gte: vi.fn(),
}))
vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: {
    settleEvent: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
    whatsappFlowModel: {},
    conversationModel: {},
  }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    whatsapp: {},
    messenger: {},
  },
  resolveIntegrationContextFromContactInbox: (...args: unknown[]) =>
    mockResolveIntegrationContext(...args),
}))

const { stepSendTyping } = await import(
  "../src/integration/handlers/step-handlers"
)
const { sendTypingToChannel } = await import(
  "../src/chat/handlers/send-message"
)

describe("Typing Indicators in Worker", () => {
  const conversation = {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
  }
  const contactInbox = {
    id: "ci-1",
    channel: "whatsapp",
    sourceId: "84123456789",
  }
  const mockIntegration = {
    runChannelHandler: mockRunChannelHandler,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveIntegrationContext.mockResolvedValue({
      integration: mockIntegration,
      ctx: { auth: { metadata: { phoneNumber: { id: "pn-1" } } } },
    })
    mockRunChannelHandler.mockResolvedValue(undefined)
  })

  describe("stepSendTyping", () => {
    test("looks up latest incoming message to extract sourceId as messageId and calls sendTyping", async () => {
      mockFindLatestIncomingMessage.mockResolvedValue({
        id: "msg-1",
        sourceId: "wamid.HBgLMTIzNDU2Nzg5FQIAEhgg",
        messageType: "incoming",
      })

      const stepProps = {
        conversation,
        contactInbox,
        step: {
          id: "step-1",
          type: "typing",
          seconds: 0.01, // minimal delay for test execution
        },
      }

      await stepSendTyping(stepProps as never)

      expect(mockFindLatestIncomingMessage).toHaveBeenCalledWith({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        sinceTime: expect.any(Date),
      })

      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "sendTyping",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            typing: true,
            seconds: 0.01,
            messageId: "wamid.HBgLMTIzNDU2Nzg5FQIAEhgg",
          },
        }),
      )
    })

    test("handles missing incoming message gracefully (messageId undefined)", async () => {
      mockFindLatestIncomingMessage.mockResolvedValue(undefined)

      const stepProps = {
        conversation,
        contactInbox,
        step: {
          id: "step-2",
          type: "typing",
          seconds: 0.01,
        },
      }

      await stepSendTyping(stepProps as never)

      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "sendTyping",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            typing: true,
            seconds: 0.01,
            messageId: undefined,
          },
        }),
      )
    })
  })

  describe("sendTypingToChannel", () => {
    test("forwards provided messageId without querying DB", async () => {
      await sendTypingToChannel({
        conversation,
        contactInbox,
        typing: true,
        seconds: 5,
        messageId: "wamid.provided-id",
      } as never)

      expect(mockFindLatestIncomingMessage).not.toHaveBeenCalled()
      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "sendTyping",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            typing: true,
            seconds: 5,
            messageId: "wamid.provided-id",
          },
        }),
      )
    })

    test("falls back to querying latest incoming message if channel is whatsapp and messageId is missing", async () => {
      mockFindLatestIncomingMessage.mockResolvedValue({
        id: "msg-2",
        sourceId: "wamid.fallback-id",
      })

      await sendTypingToChannel({
        conversation,
        contactInbox,
        typing: true,
        seconds: 5,
      } as never)

      expect(mockFindLatestIncomingMessage).toHaveBeenCalledWith({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        sinceTime: expect.any(Date),
      })

      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "sendTyping",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            typing: true,
            seconds: 5,
            messageId: "wamid.fallback-id",
          },
        }),
      )
    })
  })
})
