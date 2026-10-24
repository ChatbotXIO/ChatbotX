import { createdAtFromId, createId } from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockEnqueueLeaderboardAward } = vi.hoisted(() => ({
  mockEnqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  enqueueLeaderboardAward: mockEnqueueLeaderboardAward,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactActivityService: {
    recordKeywordMatch: vi.fn().mockResolvedValue(true),
  },
  adsConversionService: {
    enqueueKeywordMatchedEvaluation: vi.fn().mockResolvedValue(undefined),
    isEligibleChannel: () => false,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { flowModel: { findFirst: vi.fn().mockResolvedValue(null) } } },
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
  chatQueue: { add: vi.fn().mockResolvedValue(undefined) },
  integrationQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

const { dispatchAutomatedResponseReply } = await import("../src/dispatch-reply")

const conversation = {
  id: "conversation-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as never

const contactInbox = (channel: string) =>
  ({
    id: "ci-1",
    inboxId: "inbox-1",
    contactId: "contact-1",
    channel,
  }) as never

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "ar-1",
  type: "inbound",
  keywords: ["hello"],
  flowId: null,
  text: "hi there",
  ...overrides,
})

describe("dispatchAutomatedResponseReply leaderboard keywords rule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("awards `keywords` once for an inbound match on messenger/instagram", async () => {
    const messageId = createId()
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("instagram"),
      messageId,
      text: "hello there",
      rules: [rule({ text: null }), rule({ id: "ar-2" })],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledTimes(1)
    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      rule: "keywords",
      sourceRef: messageId,
      eventAt: createdAtFromId(messageId),
    })
  })

  test("awards `keywords` for a tiktok DM, never for threads (no DMs)", async () => {
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("tiktok"),
      messageId: createId(),
      text: "hello",
      rules: [rule()],
      triggerType: "contact_message_in",
    })
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("threads"),
      messageId: createId(),
      text: "hello",
      rules: [rule()],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledTimes(1)
    expect(mockEnqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({ rule: "keywords", inboxId: "inbox-1" }),
    )
  })

  test("skips other channels, outbound rules and non-matching text", async () => {
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("whatsapp"),
      messageId: createId(),
      text: "hello",
      rules: [rule()],
      triggerType: "contact_message_in",
    })
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("messenger"),
      messageId: createId(),
      text: "hello",
      rules: [rule({ type: "outbound" })],
      triggerType: "agent_message_out",
    })
    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("messenger"),
      messageId: createId(),
      text: "goodbye",
      rules: [rule()],
      triggerType: "contact_message_in",
    })

    expect(mockEnqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})

describe("dispatchAutomatedResponseReply flow rule start flag", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { db } = await import("@chatbotx.io/database/client")
    vi.mocked(db.query.flowModel.findFirst).mockResolvedValue({
      id: "flow-1",
    } as never)
  })

  test.each([
    [true, true],
    [undefined, undefined],
  ])("enqueues the flow with startedByContactMessage=%s -> %s", async (flag, expected) => {
    const { integrationQueue } = await import("@chatbotx.io/worker-config")

    await dispatchAutomatedResponseReply({
      conversation,
      contactInbox: contactInbox("messenger"),
      messageId: createId(),
      text: "hello there",
      rules: [rule({ flowId: "flow-1", text: null })],
      triggerType: "contact_message_in",
      ...(flag === undefined ? {} : { startedByContactMessage: flag }),
    })

    const [, job] = vi.mocked(integrationQueue.add).mock
      .calls[0] as unknown as [
      string,
      { data: { startedByContactMessage?: boolean } },
    ]
    expect(job.data.startedByContactMessage).toBe(expected)
  })
})
