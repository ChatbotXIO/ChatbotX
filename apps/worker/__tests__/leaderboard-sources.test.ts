import { beforeEach, describe, expect, test, vi } from "vitest"

const { enqueueLeaderboardAward, inboxHasLeaderboardRule, findByIds } =
  vi.hoisted(() => ({
    enqueueLeaderboardAward: vi.fn().mockResolvedValue(true),
    inboxHasLeaderboardRule: vi.fn().mockResolvedValue(false),
    findByIds: vi.fn().mockResolvedValue([]),
  }))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  enqueueLeaderboardAward,
  inboxHasLeaderboardRule,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: { findByIds },
}))

const {
  awardCommentLeaderboard,
  awardInboundMessageLeaderboard,
  awardReactionLeaderboard,
  isEmojiOnlyText,
} = await import("../src/integration/handlers/leaderboard-sources")

const createdAt = new Date("2026-10-01T10:00:00Z")
const inbox = (channel: string) => ({
  id: "inbox-1",
  workspaceId: "ws-1",
  channel,
})
const message = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  sourceId: "mid-1",
  createdAt,
  messageType: "incoming",
  text: "hello",
  contentAttributes: null,
  ...overrides,
})
const base = {
  workspaceId: "ws-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  eventAt: createdAt,
}

describe("awardInboundMessageLeaderboard", () => {
  beforeEach(() => vi.clearAllMocks())

  test("Zalo inbound message scores `message` with the message source id", async () => {
    await awardInboundMessageLeaderboard({
      inbox: inbox("zalo"),
      contactId: "contact-1",
      message: message(),
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "message",
      sourceRef: "mid-1",
    })
  })

  test("WhatsApp CTWA referral scores `ctwaReactions` keyed by the click id", async () => {
    await awardInboundMessageLeaderboard({
      inbox: inbox("whatsapp"),
      contactId: "contact-1",
      message: message(),
      referral: { ctwaClid: "clid-9", adId: "ad-1" },
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "ctwaReactions",
      sourceRef: "ctwa:clid-9",
    })
  })

  test("WhatsApp without an ad referral (or a Google click only) does not score", async () => {
    await awardInboundMessageLeaderboard({
      inbox: inbox("whatsapp"),
      contactId: "contact-1",
      message: message(),
      referral: { gclid: "g-1" },
    })
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })

  test("Instagram story mention scores `storyMention`", async () => {
    await awardInboundMessageLeaderboard({
      inbox: inbox("instagram"),
      contactId: "contact-1",
      message: message({ contentAttributes: { type: "story_mention" } }),
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "storyMention",
      sourceRef: "mid-1",
    })
  })

  test("Instagram emoji-only story reply scores `storyReaction`; a typed reply does not", async () => {
    const story = { type: "story_reply", story: { id: "s-1" } }
    await awardInboundMessageLeaderboard({
      inbox: inbox("instagram"),
      contactId: "contact-1",
      message: message({ text: "😍", contentAttributes: story }),
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "storyReaction",
      sourceRef: "mid-1",
    })

    enqueueLeaderboardAward.mockClear()
    await awardInboundMessageLeaderboard({
      inbox: inbox("instagram"),
      contactId: "contact-1",
      message: message({ text: "love it 😍", contentAttributes: story }),
    })
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })

  test("outgoing echoes never score", async () => {
    await awardInboundMessageLeaderboard({
      inbox: inbox("zalo"),
      contactId: "contact-1",
      message: message({ messageType: "outgoing" }),
    })
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})

describe("awardCommentLeaderboard", () => {
  beforeEach(() => vi.clearAllMocks())

  const comment = {
    inbox: inbox("messenger"),
    contactId: "contact-1",
    commentId: "page_post-1_c-1",
    externalPostId: "page_post-1",
    channelPostId: "post-row-1",
    text: "a long enough comment",
    isLive: false,
    isReply: false,
    eventAt: createdAt,
  }

  test("scores `comments` with the normalized post id, length and publish time", async () => {
    inboxHasLeaderboardRule.mockResolvedValueOnce(true)
    findByIds.mockResolvedValueOnce([
      { publishedAt: new Date("2026-10-01T09:30:00Z") },
    ])
    await awardCommentLeaderboard(comment)
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "comments",
      sourceRef: "page_post-1_c-1",
      context: {
        postId: "post-1",
        textLength: comment.text.length,
        postPublishedAt: "2026-10-01T09:30:00.000Z",
      },
    })
  })

  test("skips the post lookup when no leaderboard listens", async () => {
    await awardCommentLeaderboard(comment)
    expect(findByIds).not.toHaveBeenCalled()
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { postId: "post-1", textLength: comment.text.length },
      }),
    )
  })

  test("a live comment scores `liveComments`; a reply scores nothing", async () => {
    await awardCommentLeaderboard({ ...comment, isLive: true })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith(
      expect.objectContaining({ rule: "liveComments" }),
    )
    enqueueLeaderboardAward.mockClear()
    await awardCommentLeaderboard({ ...comment, isReply: true })
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})

describe("awardReactionLeaderboard", () => {
  beforeEach(() => vi.clearAllMocks())

  test("a new WhatsApp reaction scores `ctwaReactions` keyed by the reaction row", async () => {
    await awardReactionLeaderboard({
      inbox: inbox("whatsapp"),
      contactId: "contact-1",
      reactionSourceId: "wamid.1-reaction-react",
      action: "react",
      eventAt: createdAt,
    })
    expect(enqueueLeaderboardAward).toHaveBeenCalledWith({
      ...base,
      rule: "ctwaReactions",
      sourceRef: "wamid.1-reaction-react",
    })
  })

  test("unreacts and non-WhatsApp reactions do not score", async () => {
    await awardReactionLeaderboard({
      inbox: inbox("whatsapp"),
      contactId: "contact-1",
      reactionSourceId: "x",
      action: "unreact",
      eventAt: createdAt,
    })
    await awardReactionLeaderboard({
      inbox: inbox("instagram"),
      contactId: "contact-1",
      reactionSourceId: "x",
      action: "react",
      eventAt: createdAt,
    })
    expect(enqueueLeaderboardAward).not.toHaveBeenCalled()
  })
})

describe("isEmojiOnlyText", () => {
  test("accepts emoji (incl. ZWJ sequences) and rejects words or digits", () => {
    expect(isEmojiOnlyText("🔥")).toBe(true)
    expect(isEmojiOnlyText(" ❤️ 👍🏽 ")).toBe(true)
    expect(isEmojiOnlyText("👨‍👩‍👧")).toBe(true)
    expect(isEmojiOnlyText("123")).toBe(false)
    expect(isEmojiOnlyText("wow 🔥")).toBe(false)
    expect(isEmojiOnlyText("")).toBe(false)
    expect(isEmojiOnlyText(undefined)).toBe(false)
  })
})
