import { beforeEach, describe, expect, test, vi } from "vitest"

// The edit forms write back whatever these adapters return, so anything an
// adapter drops is erased on the next save — a `mentions` filter silently
// becomes "all comments", and every reply text after the first disappears.

const commentAutomationService = {
  getThreadsAutomation: vi.fn(),
  listThreadsAutomations: vi.fn(),
  getTiktokAutomation: vi.fn(),
  listTiktokAutomations: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ commentAutomationService }))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
}))

const { getThreadsComment, listThreadsComments } = await import(
  "@/features/threads-comments/queries"
)
const { getTiktokComment, listTiktokComments } = await import(
  "@/features/tiktok-comments/queries"
)

const MENTIONS = { type: "mentions", value: [], mentionCount: 2 }
const TEXTS = [{ value: "first" }, { value: "second" }, { value: "third" }]

function buildRow() {
  return {
    id: "1",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    name: "automation",
    workspaceId: "1",
    folderId: null,
    type: "threads",
    isActive: true,
    startTime: null,
    endTime: null,
    repliesCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    seenCount: 0,
    clickedCount: 0,
    failedCount: 0,
    missedCount: 0,
    post: { type: "all", value: [] },
    privateReply: { type: "none", value: null },
    publicReply: { type: "text", value: "first", values: TEXTS },
    includeKeywords: MENTIONS,
    excludeKeywords: [],
    excludeKeywordsType: "contain",
    options: {
      replyToNewContactsOnly: false,
      replyOncePerUserPerPost: false,
      likeUserComment: false,
      replyToUsersWhoCommentedOnOtherPosts: true,
      ignoreCommentReplies: true,
      trackUserTags: false,
    },
    hideComments: {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      hasGif: false,
      hasEmoji: false,
      keywords: [],
      showCommentsAfter: "none",
    },
    replyAfter: { type: "immediately", value: 0 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Threads comment read adapter", () => {
  test("get keeps the mentions filter and its count", async () => {
    commentAutomationService.getThreadsAutomation.mockResolvedValue(buildRow())

    const result = await getThreadsComment("1", "1")

    expect(result.includeKeywords).toEqual(MENTIONS)
  })

  test("get keeps every text of a multi-text reply", async () => {
    commentAutomationService.getThreadsAutomation.mockResolvedValue(buildRow())

    const result = await getThreadsComment("1", "1")

    expect(result.publicReply).toEqual({
      type: "text",
      value: "first",
      values: TEXTS,
    })
  })

  test("list keeps both, so it cannot disagree with get", async () => {
    commentAutomationService.listThreadsAutomations.mockResolvedValue({
      data: [buildRow()],
      total: 1,
    })

    const { data } = await listThreadsComments({
      workspaceId: "1",
      page: 1,
      perPage: 10,
    } as never)

    expect(data[0]?.includeKeywords).toEqual(MENTIONS)
    expect(data[0]?.publicReply).toMatchObject({ values: TEXTS })
  })
})

describe("TikTok comment read adapter", () => {
  test("get keeps the mentions filter and every reply text", async () => {
    commentAutomationService.getTiktokAutomation.mockResolvedValue({
      ...buildRow(),
      type: "tiktok",
    })

    const result = await getTiktokComment("1", "1")

    expect(result.includeKeywords).toEqual(MENTIONS)
    expect(result.publicReply).toMatchObject({ values: TEXTS })
  })

  test("list keeps both", async () => {
    commentAutomationService.listTiktokAutomations.mockResolvedValue({
      data: [{ ...buildRow(), type: "tiktok" }],
      pageCount: 1,
    })

    const { data } = await listTiktokComments({ workspaceId: "1" } as never)

    expect(data[0]?.includeKeywords).toEqual(MENTIONS)
    expect(data[0]?.publicReply).toMatchObject({ values: TEXTS })
  })
})
