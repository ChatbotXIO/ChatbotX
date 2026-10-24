import { createdAtFromId, createId } from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chatAdd: vi.fn().mockResolvedValue(undefined),
  findFlow: vi.fn(),
  integrationAdd: vi.fn().mockResolvedValue(undefined),
  recordKeywordMatch: vi.fn().mockResolvedValue(true),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  enqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    enqueueKeywordMatchedEvaluation: vi.fn().mockResolvedValue(undefined),
    isEligibleChannel: () => false,
  },
  contactActivityService: { recordKeywordMatch: mocks.recordKeywordMatch },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { flowModel: { findFirst: mocks.findFlow } } },
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
  chatQueue: { add: mocks.chatAdd },
  integrationQueue: { add: mocks.integrationAdd },
}))

const { dispatchAutomatedResponseReply } = await import("../src/dispatch-reply")

const conversation = {
  id: "conversation-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as never

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  channel: "messenger",
} as never

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "ar-1",
  type: "inbound",
  keywords: ["hello"],
  flowId: null,
  text: "hi there",
  ...overrides,
})

const dispatch = (
  rules: ReturnType<typeof rule>[],
  messageId = createId(),
  text = "Hello there",
) =>
  dispatchAutomatedResponseReply({
    conversation,
    contactInbox,
    messageId,
    text,
    rules: rules as never,
    triggerType: "contact_message_in",
  })

describe("dispatchAutomatedResponseReply contact activity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFlow.mockResolvedValue({ id: "flow-1" })
    mocks.recordKeywordMatch.mockResolvedValue(true)
  })

  test("records the original message text before a text reply is sent", async () => {
    const messageId = createId()
    const order: string[] = []
    mocks.recordKeywordMatch.mockImplementation(() => {
      order.push("record")
      return Promise.resolve(true)
    })
    mocks.chatAdd.mockImplementation(() => {
      order.push("send")
      return Promise.resolve()
    })

    expect(await dispatch([rule()], messageId, "Hello There")).toBe(true)

    expect(order).toEqual(["record", "send"])
    expect(mocks.recordKeywordMatch).toHaveBeenCalledWith({
      automatedResponseId: "ar-1",
      contactId: "contact-1",
      messageId,
      occurredAt: createdAtFromId(messageId),
      text: "Hello There",
      workspaceId: "ws-1",
    })
  })

  test("records before the flow is enqueued", async () => {
    const order: string[] = []
    mocks.recordKeywordMatch.mockImplementation(() => {
      order.push("record")
      return Promise.resolve(true)
    })
    mocks.integrationAdd.mockImplementation(() => {
      order.push("enqueue")
      return Promise.resolve()
    })

    await dispatch([rule({ flowId: "flow-1", text: null })])

    expect(order).toEqual(["record", "enqueue"])
  })

  test("records only the first actionable rule that wins", async () => {
    await dispatch([rule({ id: "ar-1" }), rule({ id: "ar-2" })])

    expect(mocks.recordKeywordMatch).toHaveBeenCalledTimes(1)
    expect(
      mocks.recordKeywordMatch.mock.calls[0]?.[0].automatedResponseId,
    ).toBe("ar-1")
  })

  test("skips a rule whose flow is dead and records the next actionable one", async () => {
    mocks.findFlow.mockResolvedValue(null)

    await dispatch([
      rule({ id: "ar-dead", flowId: "flow-gone", text: null }),
      rule({ id: "ar-live" }),
    ])

    expect(mocks.recordKeywordMatch).toHaveBeenCalledTimes(1)
    expect(
      mocks.recordKeywordMatch.mock.calls[0]?.[0].automatedResponseId,
    ).toBe("ar-live")
  })

  test("records nothing for an outbound (Page) rule", async () => {
    await dispatch([rule({ type: "outbound" })], createId(), "hello")

    expect(mocks.recordKeywordMatch).not.toHaveBeenCalled()
    expect(mocks.chatAdd).toHaveBeenCalledTimes(1)
  })

  test("records nothing when no rule matches", async () => {
    expect(await dispatch([rule({ keywords: ["goodbye"] })])).toBe(false)

    expect(mocks.recordKeywordMatch).not.toHaveBeenCalled()
  })

  test("sends nothing when recording fails, so the job retries cleanly", async () => {
    mocks.recordKeywordMatch.mockRejectedValue(new Error("db down"))

    await expect(dispatch([rule()])).rejects.toThrow("db down")

    expect(mocks.chatAdd).not.toHaveBeenCalled()
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
  })
})
