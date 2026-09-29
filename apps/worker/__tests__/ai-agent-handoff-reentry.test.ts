import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  actionExecutor: vi.fn(),
  aiAgentFindDefault: vi.fn(),
  automatedResponseEnqueue: vi.fn(),
  conversationFindBy: vi.fn(),
  createReplyModel: vi.fn(),
  emit: vi.fn(),
  findTriggerMessage: vi.fn(),
  getSafeSinceTime: vi.fn(),
  loggerInfo: vi.fn(),
  streamText: vi.fn(),
  workspaceFindById: vi.fn(),
  workspaceIsActiveNow: vi.fn(),
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: { enqueue: mocks.automatedResponseEnqueue },
}))
vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: { findDefault: mocks.aiAgentFindDefault },
  conversationService: { findBy: mocks.conversationFindBy },
  workspaceService: {
    findById: mocks.workspaceFindById,
    isActiveNow: mocks.workspaceIsActiveNow,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: async () => ({
    findTriggerMessage: mocks.findTriggerMessage,
  }),
  getSafeSinceTime: mocks.getSafeSinceTime,
}))
vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mocks.emit,
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  },
}))
vi.mock("ai", () => ({
  stepCountIs: () => () => true,
  streamText: mocks.streamText,
  tool: (input: unknown) => input,
}))
vi.mock("../src/lib/ai/reply-model", () => ({
  createReplyModel: mocks.createReplyModel,
  getProviderName: () => "openai",
}))
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: async () => ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      channel: "webchat",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      lastMessageAt: new Date("2026-09-28T00:00:00.000Z"),
    },
  }),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn() },
}))
vi.mock("../src/integration/handlers/ai-agent-actions/action-executor", () => ({
  executeAIAgentAction: mocks.actionExecutor,
}))

const { processHandoffReentry } = await import(
  "../src/integration/handlers/ai-agent-actions/handoff-reentry"
)

const data = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  messageId: "message-1",
}

describe("processHandoffReentry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.automatedResponseEnqueue.mockResolvedValue(undefined)
    mocks.emit.mockResolvedValue(undefined)
    mocks.getSafeSinceTime.mockReturnValue(new Date("2026-09-21T00:00:00.000Z"))
    mocks.workspaceFindById.mockResolvedValue({ id: "workspace-1" })
    mocks.workspaceIsActiveNow.mockReturnValue(true)
    mocks.findTriggerMessage.mockResolvedValue({
      senderType: "contact",
      text: "Tôi muốn xem thông tin tự động trước, chưa cần gặp nhân viên.",
    })
    mocks.aiAgentFindDefault.mockResolvedValue({
      id: "agent-1",
      actionPrompt: null,
      actionRules: [
        {
          id: "return-to-bot",
          when: "Khách muốn xem thông tin tự động trước.",
          actions: [{ id: "enable-bot", type: "transfer_to_bot" }],
        },
      ],
      models: [{ provider: "openai", model: "gpt-test" }],
      temperature: 0,
    })
    mocks.createReplyModel.mockResolvedValue({ model: {} })
    mocks.actionExecutor.mockResolvedValue({
      actionId: "enable-bot",
      outcome: "executed",
      reason: "ok",
    })
  })

  test("enables bot only after the classifier selects the configured rule with valid evidence", async () => {
    mocks.conversationFindBy
      .mockResolvedValueOnce({ botEnabled: false })
      .mockResolvedValueOnce({ botEnabled: true })
    mocks.streamText.mockImplementation(async ({ tools }) => {
      await tools.select_handoff_reentry_rule.execute(
        {
          matches: [
            {
              ruleId: "return-to-bot",
              whenEvidence: "muốn xem thông tin tự động trước",
              returnToBotEvidence: "chưa cần gặp nhân viên",
            },
          ],
        },
        { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
      )
      return { text: Promise.resolve("") }
    })

    await processHandoffReentry(data)

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: {
          type: "tool",
          toolName: "select_handoff_reentry_rule",
        },
        tools: { select_handoff_reentry_rule: expect.anything() },
        temperature: 0,
      }),
    )
    expect(mocks.actionExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { id: "enable-bot", type: "transfer_to_bot" },
      }),
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "executed", actionToolCalled: true }),
      expect.any(String),
    )
    expect(mocks.automatedResponseEnqueue).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      messageId: "message-1",
      messageText:
        "Tôi muốn xem thông tin tự động trước, chưa cần gặp nhân viên.",
      workspaceId: "workspace-1",
    })
    expect(mocks.emit).not.toHaveBeenCalled()
    expect(mocks.findTriggerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sinceTime: new Date("2026-09-21T00:00:00.000Z"),
      }),
    )
  })

  test("forwards the trigger message when the bot is already enabled", async () => {
    mocks.conversationFindBy.mockResolvedValue({ botEnabled: true })

    await processHandoffReentry(data)

    expect(mocks.findTriggerMessage).toHaveBeenCalledOnce()
    expect(mocks.automatedResponseEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        messageText:
          "Tôi muốn xem thông tin tự động trước, chưa cần gặp nhân viên.",
      }),
    )
    expect(mocks.createReplyModel).not.toHaveBeenCalled()
    expect(mocks.streamText).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  test("emits one failure event for a final no-match outcome", async () => {
    mocks.conversationFindBy.mockResolvedValue({ botEnabled: false })
    mocks.streamText.mockResolvedValue({ text: Promise.resolve("") })

    await processHandoffReentry(data)

    expect(mocks.automatedResponseEnqueue).not.toHaveBeenCalled()
    expect(mocks.emit).toHaveBeenCalledOnce()
    expect(mocks.emit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        eventType: "message:bot_received",
        hasResponse: false,
        messageId: "message-1",
      }),
    )
  })

  test("keeps human handoff when a classifier falsely selects alo", async () => {
    mocks.conversationFindBy.mockResolvedValue({ botEnabled: false })
    mocks.findTriggerMessage.mockResolvedValue({
      senderType: "contact",
      text: "alo",
    })
    mocks.streamText.mockImplementation(async ({ tools }) => {
      await tools.select_handoff_reentry_rule.execute(
        {
          matches: [
            {
              ruleId: "return-to-bot",
              whenEvidence: "alo",
              returnToBotEvidence: "alo",
            },
          ],
        },
        { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
      )
      return { text: Promise.resolve("") }
    })

    await processHandoffReentry(data)

    expect(mocks.actionExecutor).not.toHaveBeenCalled()
    expect(mocks.automatedResponseEnqueue).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "no_match",
        reason: "invalid_evidence",
      }),
      expect.any(String),
    )
  })

  test("keeps human handoff when classifier evidence is not quoted from the message", async () => {
    mocks.conversationFindBy.mockResolvedValue({ botEnabled: false })
    mocks.streamText.mockImplementation(async ({ tools }) => {
      await tools.select_handoff_reentry_rule.execute(
        {
          matches: [
            {
              ruleId: "return-to-bot",
              whenEvidence: "tôi muốn dùng chatbot ngay",
              returnToBotEvidence: "không cần nhân viên",
            },
          ],
        },
        { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
      )
      return { text: Promise.resolve("") }
    })

    await processHandoffReentry(data)

    expect(mocks.actionExecutor).not.toHaveBeenCalled()
    expect(mocks.automatedResponseEnqueue).not.toHaveBeenCalled()
  })

  test("does not call a model when the workspace is inactive", async () => {
    mocks.workspaceIsActiveNow.mockReturnValue(false)

    await processHandoffReentry(data)

    expect(mocks.conversationFindBy).not.toHaveBeenCalled()
    expect(mocks.findTriggerMessage).not.toHaveBeenCalled()
    expect(mocks.createReplyModel).not.toHaveBeenCalled()
    expect(mocks.streamText).not.toHaveBeenCalled()
    expect(mocks.automatedResponseEnqueue).not.toHaveBeenCalled()
    expect(mocks.emit).toHaveBeenCalledOnce()
  })

  test("does not create a model call when no standalone transfer-to-bot rule exists", async () => {
    mocks.conversationFindBy.mockResolvedValue({ botEnabled: false })
    mocks.aiAgentFindDefault.mockResolvedValue({
      id: "agent-1",
      actionRules: [
        {
          id: "mixed-rule",
          when: "unsafe to run during handoff",
          actions: [
            { id: "enable-bot", type: "transfer_to_bot" },
            { id: "archive", type: "archive" },
          ],
        },
      ],
      models: [{ provider: "openai", model: "gpt-test" }],
    })

    await processHandoffReentry(data)

    expect(mocks.createReplyModel).not.toHaveBeenCalled()
    expect(mocks.streamText).not.toHaveBeenCalled()
    expect(mocks.actionExecutor).not.toHaveBeenCalled()
  })
})
