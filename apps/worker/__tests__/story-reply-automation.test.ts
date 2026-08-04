import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockFindContactInboxBy,
  mockFindActiveAutomations,
  mockIsWithinSchedule,
  mockIncrementRepliesCount,
  mockWorkspaceFindById,
  mockAiAgentFindBy,
  mockChatQueueAdd,
  mockIntegrationQueueAdd,
  mockGenerateAIReplyText,
  mockContactVariableGetAll,
  mockContactVariableReplaceAll,
  mockLoggerInfo,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockFindContactInboxBy: vi.fn(),
  mockFindActiveAutomations: vi.fn(),
  mockIsWithinSchedule: vi.fn(),
  mockIncrementRepliesCount: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockAiAgentFindBy: vi.fn(),
  mockChatQueueAdd: vi.fn(),
  mockIntegrationQueueAdd: vi.fn(),
  mockGenerateAIReplyText: vi.fn(),
  mockContactVariableGetAll: vi.fn(),
  mockContactVariableReplaceAll: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findBy: mockFindContactInboxBy },
  aiAgentService: { findBy: mockAiAgentFindBy },
  fbCommentAutomationService: { isWithinSchedule: mockIsWithinSchedule },
  igStoryAutomationService: {
    findActiveAutomations: mockFindActiveAutomations,
    incrementRepliesCount: mockIncrementRepliesCount,
  },
  workspaceService: { findById: mockWorkspaceFindById },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mockContactVariableGetAll,
    replaceAll: mockContactVariableReplaceAll,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn().mockReturnValue("webhook"),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/automated-response/replies", () => ({
  generateAIReplyText: mockGenerateAIReplyText,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { processStoryReplyAutomation } = await import(
  "../src/integration/handlers/story-reply-automation"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STORY_ID = "2357494887629356"
const MESSAGE_ID = "message-1"

function buildAutomation(reply: { type: string; value: string | null }) {
  return {
    id: "automation-1",
    story: { type: "all", value: [] },
    includeKeywords: { type: "all", value: [] },
    reply,
  }
}

function buildJobData(overrides: { message?: string } = {}) {
  return {
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    messageId: MESSAGE_ID,
    storyId: STORY_ID,
    message: overrides.message ?? "hello",
    channelType: "instagram",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindContactInboxBy.mockResolvedValue({
    id: "contact-inbox-1",
    contactId: "contact-1",
  })
  mockWorkspaceFindById.mockResolvedValue({ timezone: "UTC" })
  mockIsWithinSchedule.mockReturnValue(true)
  mockIncrementRepliesCount.mockResolvedValue(undefined)
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockContactVariableGetAll.mockResolvedValue({})
  mockContactVariableReplaceAll.mockImplementation(({ text }) => text)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processStoryReplyAutomation text reply variable resolution", () => {
  test("resolves {{variable}} tokens through contactVariableService before sending the story reply", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ type: "text", value: "Hi {{contact.firstName}}" }),
    ])
    mockContactVariableReplaceAll.mockResolvedValue("Hi Jane")

    await processStoryReplyAutomation(buildJobData() as any)

    expect(mockContactVariableGetAll).toHaveBeenCalledWith({
      contactId: "contact-1",
      contactInbox: { id: "contact-inbox-1", contactId: "contact-1" },
    })
    expect(mockContactVariableReplaceAll).toHaveBeenCalledWith({
      text: "Hi {{contact.firstName}}",
      variables: {},
    })
    expect(mockChatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: {
        conversation: { id: "conversation-1", workspaceId: "workspace-1" },
        contactInbox: { id: "contact-inbox-1", contactId: "contact-1" },
        text: "Hi Jane",
      },
    })
    expect(mockIncrementRepliesCount).toHaveBeenCalledWith("automation-1")
  })

  test("sends the raw text unchanged when it contains no variable tokens", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ type: "text", value: "Thanks for the reply!" }),
    ])

    await processStoryReplyAutomation(buildJobData() as any)

    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChatMessage",
      expect.objectContaining({
        data: expect.objectContaining({ text: "Thanks for the reply!" }),
      }),
    )
  })

  test("falls back to the raw text when variable resolution fails", async () => {
    mockFindActiveAutomations.mockResolvedValue([
      buildAutomation({ type: "text", value: "Hi {{contact.firstName}}" }),
    ])
    mockContactVariableReplaceAll.mockRejectedValue(new Error("db down"))

    await processStoryReplyAutomation(buildJobData() as any)

    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChatMessage",
      expect.objectContaining({
        data: expect.objectContaining({ text: "Hi {{contact.firstName}}" }),
      }),
    )
    expect(mockIncrementRepliesCount).toHaveBeenCalledWith("automation-1")
  })
})
