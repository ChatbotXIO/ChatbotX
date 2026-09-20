import { beforeEach, describe, expect, test, vi } from "vitest"

const mockMergeContentAttributesBySourceId = vi.fn()
const mockIdentifyInbox = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    mergeContentAttributesBySourceId: mockMergeContentAttributesBySourceId,
  }),
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentifyInbox,
  },
}))

const {
  receiveTiktokHighIntentComment,
  TIKTOK_HIGH_INTENT_ATTRIBUTE,
  TiktokHighIntentCommentPendingError,
} = await import("../src/integration/handlers/tiktok-high-intent-comment")

const COMMENT_ID = "7247303576418566913"
const WORKSPACE_ID = "workspace-1"

const payload = {
  integrationType: "tiktok",
  integrationIdentifier: "open-1",
  commentId: COMMENT_ID,
  commentText: "how much is this?",
  uniqueIdentifier: "+ABc1D2/E0fGhijkl",
  isFollower: true,
  commentedAt: 1_687_394_416,
}

describe("receiveTiktokHighIntentComment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIdentifyInbox.mockResolvedValue({
      inbox: { workspaceId: WORKSPACE_ID },
    })
  })

  test("merges the flag onto the ingested comment, keyed by source id", async () => {
    mockMergeContentAttributesBySourceId.mockResolvedValue({
      id: "message-1",
      contentAttributes: { postId: "video-1" },
    })

    await receiveTiktokHighIntentComment(payload)

    expect(mockMergeContentAttributesBySourceId).toHaveBeenCalledWith(
      COMMENT_ID,
      WORKSPACE_ID,
      {
        [TIKTOK_HIGH_INTENT_ATTRIBUTE]: {
          at: expect.any(String),
          isFollower: true,
          commentedAt: 1_687_394_416,
        },
      },
    )
  })

  // One jsonb key only: `postId` on the same row backs `{{last_post_id}}`, and a
  // read-modify-write here would be racing the comment ingest that writes it.
  test("writes exactly one attribute key", async () => {
    mockMergeContentAttributesBySourceId.mockResolvedValue({
      id: "message-1",
      contentAttributes: {},
    })

    await receiveTiktokHighIntentComment(payload)

    const [, , overlay] = mockMergeContentAttributesBySourceId.mock.calls[0]
    expect(Object.keys(overlay)).toEqual([TIKTOK_HIGH_INTENT_ATTRIBUTE])
  })

  // The two webhooks ride independent subscriptions, so the classifier can beat
  // the comment. Throwing is what makes BullMQ retry until they converge.
  test("throws the pending error when the comment is not ingested yet", async () => {
    mockMergeContentAttributesBySourceId.mockResolvedValue(null)

    await expect(
      receiveTiktokHighIntentComment(payload),
    ).rejects.toBeInstanceOf(TiktokHighIntentCommentPendingError)
  })

  test("is idempotent — a redelivered event merges the same key again", async () => {
    mockMergeContentAttributesBySourceId.mockResolvedValue({
      id: "message-1",
      contentAttributes: { tiktokHighIntent: { at: "2026-01-01T00:00:00Z" } },
    })

    await receiveTiktokHighIntentComment(payload)
    await receiveTiktokHighIntentComment(payload)

    expect(mockMergeContentAttributesBySourceId).toHaveBeenCalledTimes(2)
  })
})
