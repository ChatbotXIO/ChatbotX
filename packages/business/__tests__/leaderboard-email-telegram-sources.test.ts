import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findRecipient,
  findSmtpIntegrations,
  enqueueLeaderboardAward,
  upsertChat,
  listChats,
} = vi.hoisted(() => ({
  findRecipient: vi.fn(),
  findSmtpIntegrations: vi.fn(),
  enqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
  upsertChat: vi.fn().mockResolvedValue(undefined),
  listChats: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      analyticsEmailTopicModel: { findFirst: findRecipient },
      integrationSmtpModel: { findMany: findSmtpIntegrations },
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  telegramChatRepository: { upsert: upsertChat, listByInbox: listChats },
}))

vi.mock("../src/leaderboard/enqueue", () => ({ enqueueLeaderboardAward }))

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))

const { awardLeaderboardEmailEngagement } = await import(
  "../src/leaderboard/email-sources"
)
const { listTelegramLeaderboardChats, recordTelegramBotChatStatus } =
  await import("../src/leaderboard/telegram-chats")

const firstSeenAt = new Date("2026-10-01T10:00:00Z")
const firstClickedAt = new Date("2026-10-01T10:05:00Z")

describe("awardLeaderboardEmailEngagement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findRecipient.mockResolvedValue({
      id: "recipient-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      firstSeenAt,
      firstClickedAt,
      topicId: "topic-1",
      topicReferenceId: "topic-1",
    })
    findSmtpIntegrations.mockResolvedValue([
      { inboxId: "smtp-inbox-1" },
      { inboxId: "smtp-inbox-2" },
    ])
  })

  test("an open scores `emailOpen` per SMTP inbox, keyed by the recipient and first-open time", async () => {
    await awardLeaderboardEmailEngagement({ token: "tok", kind: "open" })

    expect(enqueueLeaderboardAward).toHaveBeenCalledTimes(2)
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      inboxId: "smtp-inbox-1",
      rule: "emailOpen",
      sourceRef: "recipient-1",
      eventAt: firstSeenAt,
    })
  })

  test("a click scores `emailClick` once per distinct link", async () => {
    await awardLeaderboardEmailEngagement({
      token: "tok",
      kind: "click",
      link: "https://shop.test/a",
    })
    await awardLeaderboardEmailEngagement({
      token: "tok",
      kind: "click",
      link: "https://shop.test/b",
    })

    const refs = enqueueLeaderboardAward.mock.calls.map(
      ([input]) => (input as { sourceRef: string }).sourceRef,
    )
    expect(new Set(refs).size).toBe(2)
    expect(refs.every((ref) => ref.startsWith("recipient-1:"))).toBe(true)
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({ rule: "emailClick", eventAt: firstClickedAt }),
    )
  })

  test("an unknown token or a recipient without a contact scores nothing", async () => {
    findRecipient.mockResolvedValueOnce(undefined)
    await awardLeaderboardEmailEngagement({ token: "nope", kind: "open" })
    findRecipient.mockResolvedValueOnce({
      id: "r",
      workspaceId: "ws-1",
      contactId: null,
      firstSeenAt,
      firstClickedAt: null,
    })
    await awardLeaderboardEmailEngagement({ token: "tok", kind: "open" })

    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})

describe("awardLeaderboardEmailEngagement topic gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSmtpIntegrations.mockResolvedValue([{ inboxId: "smtp-inbox-1" }])
  })

  const recipient = (overrides: Record<string, unknown>) => ({
    id: "recipient-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    firstSeenAt,
    firstClickedAt,
    ...overrides,
  })

  test("an email sent without a topic never scores", async () => {
    findRecipient.mockResolvedValue(
      recipient({ topicId: null, topicReferenceId: null }),
    )

    await awardLeaderboardEmailEngagement({ token: "tok", kind: "open" })

    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })

  test("still scores after the topic was deleted", async () => {
    findRecipient.mockResolvedValue(
      recipient({ topicId: null, topicReferenceId: "topic-gone" }),
    )

    await awardLeaderboardEmailEngagement({ token: "tok", kind: "open" })

    expect(enqueueLeaderboardAward).toHaveBeenCalledTimes(1)
  })

  test("still scores a row created before the snapshot column existed", async () => {
    findRecipient.mockResolvedValue(
      recipient({ topicId: "topic-1", topicReferenceId: null }),
    )

    await awardLeaderboardEmailEngagement({ token: "tok", kind: "open" })

    expect(enqueueLeaderboardAward).toHaveBeenCalledTimes(1)
  })
})

describe("telegram leaderboard chats", () => {
  beforeEach(() => vi.clearAllMocks())

  test("records the bot's status per chat", async () => {
    await recordTelegramBotChatStatus({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      chat: { id: "-1001", type: "supergroup", title: "Fans" },
      status: "administrator",
    })
    expect(upsertChat).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      chatId: "-1001",
      title: "Fans",
      type: "supergroup",
      botStatus: "administrator",
    })
  })

  test("lists only chats where the bot is an admin", async () => {
    listChats.mockResolvedValue([
      { chatId: "-1001", title: "Fans", type: "supergroup" },
    ])
    await expect(
      listTelegramLeaderboardChats({ workspaceId: "ws-1", inboxId: "inbox-1" }),
    ).resolves.toEqual([{ chatId: "-1001", title: "Fans", type: "supergroup" }])
    expect(listChats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      botStatuses: ["administrator", "creator"],
    })
  })
})
