import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockEnqueueKeywordMatchedEvaluation, mockChatQueueAdd } = vi.hoisted(
  () => ({
    mockEnqueueKeywordMatchedEvaluation: vi.fn().mockResolvedValue(undefined),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    enqueueKeywordMatchedEvaluation: mockEnqueueKeywordMatchedEvaluation,
    isEligibleChannel: (channel: unknown) => channel === "whatsapp",
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  },
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn().mockResolvedValue({}),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  chatQueue: { add: mockChatQueueAdd },
  integrationQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

const { dispatchAutomatedResponseReply } = await import("../src/dispatch-reply")

const baseConversation = {
  id: "conversation-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as never

function buildContactInbox(channel: string) {
  return {
    id: "ci-1",
    inboxId: "inbox-1",
    channel,
  } as never
}

describe("dispatchAutomatedResponseReply ads conversion keywordMatched trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("enqueues the keywordMatched evaluation on match for an inbound whatsapp rule", async () => {
    const matched = await dispatchAutomatedResponseReply({
      conversation: baseConversation,
      contactInbox: buildContactInbox("whatsapp"),
      messageId: "msg-1",
      text: "hello",
      rules: [
        {
          id: "ar-1",
          type: "inbound",
          keywords: ["hello"],
          flowId: null,
          text: "hi there",
        },
      ],
      triggerType: "contact_message_in",
    })

    expect(matched).toBe(true)
    expect(mockEnqueueKeywordMatchedEvaluation).toHaveBeenCalledTimes(1)
    expect(mockEnqueueKeywordMatchedEvaluation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      automatedResponseId: "ar-1",
      messageId: "msg-1",
    })
  })

  test("does not enqueue for an outbound-type rule (e.g. Page/agent-reply keywords)", async () => {
    await dispatchAutomatedResponseReply({
      conversation: baseConversation,
      contactInbox: buildContactInbox("whatsapp"),
      messageId: "msg-1",
      text: "hello",
      rules: [
        {
          id: "ar-1",
          type: "outbound",
          keywords: ["hello"],
          flowId: null,
          text: "hi there",
        },
      ],
      triggerType: "agent_message_out",
    })

    expect(mockEnqueueKeywordMatchedEvaluation).not.toHaveBeenCalled()
  })

  test("does not enqueue for a non-whatsapp channel", async () => {
    await dispatchAutomatedResponseReply({
      conversation: baseConversation,
      contactInbox: buildContactInbox("messenger"),
      messageId: "msg-1",
      text: "hello",
      rules: [
        {
          id: "ar-1",
          type: "inbound",
          keywords: ["hello"],
          flowId: null,
          text: "hi there",
        },
      ],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueKeywordMatchedEvaluation).not.toHaveBeenCalled()
  })

  test("does not enqueue when no rule matches", async () => {
    await dispatchAutomatedResponseReply({
      conversation: baseConversation,
      contactInbox: buildContactInbox("whatsapp"),
      messageId: "msg-1",
      text: "goodbye",
      rules: [
        {
          id: "ar-1",
          type: "inbound",
          keywords: ["hello"],
          flowId: null,
          text: "hi there",
        },
      ],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueKeywordMatchedEvaluation).not.toHaveBeenCalled()
  })

  test("propagates the matched rule's own id, not a different rule in the list", async () => {
    await dispatchAutomatedResponseReply({
      conversation: baseConversation,
      contactInbox: buildContactInbox("whatsapp"),
      messageId: "msg-1",
      text: "hello",
      rules: [
        {
          id: "ar-unrelated",
          type: "inbound",
          keywords: ["bye"],
          flowId: null,
          text: "see ya",
        },
        {
          id: "ar-matched",
          type: "inbound",
          keywords: ["hello"],
          flowId: null,
          text: "hi there",
        },
      ],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueKeywordMatchedEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ automatedResponseId: "ar-matched" }),
    )
  })
})
