import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  enqueueLeaderboardAward,
  enqueueLeaderboardReverse,
  recordTelegramBotChatStatus,
  detectContactAndConversation,
  resolveExistingContactInbox,
  identifyInbox,
  inboxHasLeaderboardRule,
} = vi.hoisted(() => ({
  inboxHasLeaderboardRule: vi.fn().mockResolvedValue(true),
  enqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
  enqueueLeaderboardReverse: vi.fn().mockResolvedValue(true),
  recordTelegramBotChatStatus: vi.fn().mockResolvedValue(undefined),
  detectContactAndConversation: vi.fn(),
  resolveExistingContactInbox: vi.fn(),
  identifyInbox: vi.fn(),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  enqueueLeaderboardAward,
  enqueueLeaderboardReverse,
  recordTelegramBotChatStatus,
  inboxHasLeaderboardRule,
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  detectContactAndConversation,
  resolveExistingContactInbox,
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: identifyInbox,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { processChannelAudienceEvent } = await import(
  "../src/integration/handlers/channel-audience-event"
)

const inbox = { id: "inbox-1", workspaceId: "ws-1", channel: "telegram" }
const integrationRow = { id: "int-1", auth: {}, inboxId: "inbox-1" }
const occurredAt = "2026-10-01T10:00:00.000Z"
const user = { sourceId: "100", firstName: "Ada", username: "ada" }

describe("processChannelAudienceEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    identifyInbox.mockResolvedValue({ inbox, integrationRow })
    detectContactAndConversation.mockResolvedValue({
      contactInbox: { contactId: "contact-1" },
    })
  })

  test("with no live leaderboard scoring the rule, no contact is created", async () => {
    inboxHasLeaderboardRule.mockResolvedValueOnce(false)
    await processChannelAudienceEvent({
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      event: {
        kind: "groupMessage",
        user,
        chatId: "-1001",
        messageId: "56",
        textLength: 5,
        occurredAt,
      },
    })
    expect(inboxHasLeaderboardRule).toHaveBeenCalledWith(
      "inbox-1",
      "groupDiscussion",
    )
    expect(detectContactAndConversation).not.toHaveBeenCalled()
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })

  test("a Telegram group message resolves the same contact (no message stored) and scores groupDiscussion", async () => {
    await processChannelAudienceEvent({
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      event: {
        kind: "groupMessage",
        user,
        chatId: "-1001",
        messageId: "55",
        textLength: 11,
        occurredAt,
      },
    })

    expect(detectContactAndConversation).toHaveBeenCalledWith({
      inbox,
      integrationRow,
      incomingContact: {
        sourceId: "100",
        firstName: "Ada",
        sourceUsername: "ada",
      },
      source: "inboundMessage",
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      rule: "groupDiscussion",
      sourceRef: "-1001:55",
      eventAt: new Date(occurredAt),
      context: { chatId: "-1001", textLength: 11 },
    })
  })

  test("a Zalo follow scores `follow`; an unfollow reverses it without creating a contact", async () => {
    await processChannelAudienceEvent({
      integrationType: "zalo",
      integrationIdentifier: "oa-1",
      event: { kind: "follow", user: { sourceId: "u-9" }, occurredAt },
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: "follow",
        sourceRef: `u-9@${Date.parse(occurredAt)}`,
        eventAt: new Date(occurredAt),
      }),
    )

    resolveExistingContactInbox.mockResolvedValue({
      row: { contactId: "contact-1" },
    })
    detectContactAndConversation.mockClear()
    await processChannelAudienceEvent({
      integrationType: "zalo",
      integrationIdentifier: "oa-1",
      event: { kind: "unfollow", user: { sourceId: "u-9" }, occurredAt },
    })
    expect(detectContactAndConversation).not.toHaveBeenCalled()
    expect(enqueueLeaderboardReverse).toHaveBeenCalledWith(
      expect.objectContaining({ rule: "follow", contactId: "contact-1" }),
    )
  })

  test("leaving a group for an unknown contact does nothing", async () => {
    resolveExistingContactInbox.mockResolvedValue(null)
    await processChannelAudienceEvent({
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      event: { kind: "groupLeave", user, chatId: "-1001", occurredAt },
    })
    expect(enqueueLeaderboardReverse).not.toHaveBeenCalled()
  })

  test("joining a group scores joinGroup with the chat id", async () => {
    await processChannelAudienceEvent({
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      event: { kind: "groupJoin", user, chatId: "-1001", occurredAt },
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: "joinGroup",
        context: { chatId: "-1001" },
      }),
    )
  })

  test("the bot's own chat status is recorded for the group picker", async () => {
    await processChannelAudienceEvent({
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      event: {
        kind: "botChatStatus",
        chat: { id: "-1001", type: "supergroup", title: "Fans" },
        status: "administrator",
        occurredAt,
      },
    })
    expect(recordTelegramBotChatStatus).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      chat: { id: "-1001", type: "supergroup", title: "Fans" },
      status: "administrator",
    })
    expect(detectContactAndConversation).not.toHaveBeenCalled()
  })
})
