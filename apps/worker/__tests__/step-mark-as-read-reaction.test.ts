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

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
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

const { stepMarkAsRead, stepSendReaction } = await import(
  "../src/integration/handlers/step-handlers"
)

describe("Worker stepMarkAsRead and stepSendReaction", () => {
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

  describe("stepMarkAsRead", () => {
    test("looks up latest incoming message and calls agentMarkAsRead", async () => {
      mockFindLatestIncomingMessage.mockResolvedValue({
        id: "msg-1",
        sourceId: "wamid.incoming123",
      })

      const stepProps = {
        conversation,
        contactInbox,
        step: {
          id: "step-1",
          type: "markAsRead",
        },
      }

      await stepMarkAsRead(stepProps as never)

      expect(mockFindLatestIncomingMessage).toHaveBeenCalledWith({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        sinceTime: expect.any(Date),
      })

      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "agentMarkAsRead",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            messageId: "wamid.incoming123",
          },
        }),
      )
    })
  })

  describe("stepSendReaction", () => {
    test("looks up latest incoming message and calls sendReaction with emoji", async () => {
      mockFindLatestIncomingMessage.mockResolvedValue({
        id: "msg-2",
        sourceId: "wamid.incoming456",
      })

      const stepProps = {
        conversation,
        contactInbox,
        step: {
          id: "step-2",
          type: "reaction",
          emoji: "❤️",
        },
      }

      await stepSendReaction(stepProps as never)

      expect(mockFindLatestIncomingMessage).toHaveBeenCalledWith({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        sinceTime: expect.any(Date),
      })

      expect(mockRunChannelHandler).toHaveBeenCalledWith(
        "conversation",
        "sendReaction",
        expect.objectContaining({
          data: {
            contact: contactInbox,
            emoji: "❤️",
            messageId: "wamid.incoming456",
          },
        }),
      )
    })
  })
})
