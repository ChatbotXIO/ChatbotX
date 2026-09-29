import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockMessengerFindByWorkspaceId,
  mockInstagramFindByWorkspaceId,
  mockThreadsListByWorkspaceId,
  mockTiktokListByWorkspace,
  mockListPostComments,
  mockListInstagramLoginMediaComments,
  mockListInstagramFacebookMediaComments,
  mockListPostConversation,
  mockListTiktokComments,
} = vi.hoisted(() => ({
  mockMessengerFindByWorkspaceId: vi.fn(),
  mockInstagramFindByWorkspaceId: vi.fn(),
  mockThreadsListByWorkspaceId: vi.fn(),
  mockTiktokListByWorkspace: vi.fn(),
  mockListPostComments: vi.fn(),
  mockListInstagramLoginMediaComments: vi.fn(),
  mockListInstagramFacebookMediaComments: vi.fn(),
  mockListPostConversation: vi.fn(),
  mockListTiktokComments: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByWorkspaceId: mockMessengerFindByWorkspaceId,
  },
  instagramIntegrationService: {
    findByWorkspaceId: mockInstagramFindByWorkspaceId,
  },
  integrationThreadsService: {
    listByWorkspaceId: mockThreadsListByWorkspaceId,
  },
  tiktokIntegrationService: { listByWorkspace: mockTiktokListByWorkspace },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/comment", () => ({
  listPostComments: mockListPostComments,
}))
vi.mock("@chatbotx.io/integration-instagram/apis/comment", () => ({
  listMediaComments: mockListInstagramLoginMediaComments,
}))
vi.mock("@chatbotx.io/integration-instagram-facebook/apis/comment", () => ({
  listMediaComments: mockListInstagramFacebookMediaComments,
}))
vi.mock("@chatbotx.io/integration-threads/apis/comment", () => ({
  listPostConversation: mockListPostConversation,
}))
vi.mock("@chatbotx.io/integration-tiktok/apis/comment", () => ({
  listTiktokComments: mockListTiktokComments,
}))

const { scanPostComments } = await import(
  "../src/features/shared/comment-automation/lib/missed-comments/index"
)
const { MISSED_COMMENTS_MAX_PAGES, MissedCommentsIntegrationNotFoundError } =
  await import(
    "../src/features/shared/comment-automation/lib/missed-comments/types"
  )

const NOW = new Date("2026-09-28T12:00:00Z")
const SINCE = new Date("2026-09-21T12:00:00Z")
const RECENT = "2026-09-27T10:00:00+0000"
const RECENT_SECONDS = Math.floor(Date.parse("2026-09-27T10:00:00Z") / 1000)
const OLD = "2026-09-10T10:00:00+0000"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW })
})

describe("scanPostComments — messenger", () => {
  const page = {
    pageId: "111",
    auth: { tokens: { accessToken: "token" } },
  }

  test("queries and reports the composite post id and maps the webhook shape", async () => {
    mockMessengerFindByWorkspaceId.mockResolvedValue([page])
    mockListPostComments.mockResolvedValue({
      comments: [
        {
          id: "222_1",
          message: "price?",
          created_time: RECENT,
          from: { id: "user-1", name: "Ann" },
          message_tags: [{ id: "user-9", name: "Bob" }, { name: "no id" }],
        },
        {
          id: "222_2",
          created_time: RECENT,
          from: { id: "user-2" },
          parent: { id: "222_1" },
        },
        // The Page's own reply and an author-less comment are dropped.
        { id: "222_3", created_time: RECENT, from: { id: "111" } },
        { id: "222_4", created_time: RECENT },
      ],
    })

    const result = await scanPostComments({
      type: "messenger",
      workspaceId: "ws-1",
      postId: "222",
      since: SINCE,
    })

    expect(mockListPostComments).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "111_222" }),
    )
    expect(result).toEqual([
      {
        integrationIdentifier: "111",
        commentData: {
          commentId: "222_1",
          postId: "111_222",
          parentId: "111_222",
          fromId: "user-1",
          fromName: "Ann",
          message: "price?",
          tags: [{ id: "user-9", name: "Bob" }],
          createdTime: RECENT_SECONDS,
        },
      },
      {
        integrationIdentifier: "111",
        commentData: {
          commentId: "222_2",
          postId: "111_222",
          parentId: "222_1",
          fromId: "user-2",
          fromName: undefined,
          message: undefined,
          tags: undefined,
          createdTime: RECENT_SECONDS,
        },
      },
    ])
  })

  test("uses only the page a composite id names, and stops at the first old comment", async () => {
    mockMessengerFindByWorkspaceId.mockResolvedValue([
      { pageId: "999", auth: {} },
      page,
    ])
    mockListPostComments.mockResolvedValue({
      comments: [
        { id: "222_1", created_time: RECENT, from: { id: "user-1" } },
        { id: "222_2", created_time: OLD, from: { id: "user-2" } },
      ],
      nextCursor: "next",
    })

    const result = await scanPostComments({
      type: "messenger",
      workspaceId: "ws-1",
      postId: "111_222",
      since: SINCE,
    })

    expect(mockListPostComments).toHaveBeenCalledTimes(1)
    expect(result.map((comment) => comment.commentData.commentId)).toEqual([
      "222_1",
    ])
  })

  test("tries the next page when a bare id does not belong to the first", async () => {
    mockMessengerFindByWorkspaceId.mockResolvedValue([
      { pageId: "999", auth: {} },
      page,
    ])
    mockListPostComments
      .mockRejectedValueOnce(new Error("Unsupported get request"))
      .mockResolvedValueOnce({
        comments: [
          { id: "222_1", created_time: RECENT, from: { id: "user-1" } },
        ],
      })

    const result = await scanPostComments({
      type: "messenger",
      workspaceId: "ws-1",
      postId: "222",
      since: SINCE,
    })

    expect(
      mockListPostComments.mock.calls.map((call) => call[0].postId),
    ).toEqual(["999_222", "111_222"])
    expect(result[0]?.integrationIdentifier).toBe("111")
  })

  test("throws integration-not-found when no page is connected", async () => {
    mockMessengerFindByWorkspaceId.mockResolvedValue([])

    await expect(
      scanPostComments({
        type: "messenger",
        workspaceId: "ws-1",
        postId: "111_222",
        since: SINCE,
      }),
    ).rejects.toBeInstanceOf(MissedCommentsIntegrationNotFoundError)
  })
})

describe("scanPostComments — instagram", () => {
  test("flattens replies, filters each by its own time and skips the account", async () => {
    mockInstagramFindByWorkspaceId.mockResolvedValue([
      { igId: "ig-1", auth: {} },
    ])
    mockListInstagramFacebookMediaComments.mockResolvedValue({
      comments: [
        {
          id: "c-1",
          text: "old comment, new reply",
          timestamp: OLD,
          from: { id: "user-1", username: "ann" },
          replies: {
            data: [
              {
                id: "c-2",
                text: "reply",
                timestamp: RECENT,
                from: { id: "user-2", username: "bob" },
                parent_id: "c-1",
              },
              {
                id: "c-3",
                timestamp: RECENT,
                from: { id: "ig-1", username: "shop" },
                parent_id: "c-1",
              },
            ],
          },
        },
      ],
    })

    const result = await scanPostComments({
      type: "instagramFacebook",
      workspaceId: "ws-1",
      postId: "media-1",
      since: SINCE,
    })

    expect(mockInstagramFindByWorkspaceId).toHaveBeenCalledWith(
      "ws-1",
      "facebook",
    )
    expect(mockListInstagramLoginMediaComments).not.toHaveBeenCalled()
    expect(result).toEqual([
      {
        integrationIdentifier: "ig-1",
        commentData: {
          commentId: "c-2",
          postId: "media-1",
          parentId: "c-1",
          fromId: "user-2",
          fromName: "bob",
          fromUsername: "bob",
          message: "reply",
          createdTime: RECENT_SECONDS,
        },
      },
    ])
  })
})

describe("scanPostComments — threads", () => {
  test("keys the commenter by lowercased username and skips the account's replies", async () => {
    mockThreadsListByWorkspaceId.mockResolvedValue({
      data: [
        {
          threadsUserId: "th-1",
          auth: { metadata: { username: "Shop" }, tokens: {} },
        },
      ],
    })
    mockListPostConversation.mockResolvedValue({
      replies: [
        {
          id: "r-1",
          text: "hi",
          timestamp: RECENT,
          username: "Ann.B",
          replied_to: { id: "post-1" },
        },
        { id: "r-2", timestamp: RECENT, username: "shop" },
        {
          id: "r-3",
          timestamp: RECENT,
          username: "other",
          is_reply_owned_by_me: true,
        },
      ],
    })

    const result = await scanPostComments({
      type: "threads",
      workspaceId: "ws-1",
      postId: "post-1",
      since: SINCE,
    })

    expect(result).toEqual([
      {
        integrationIdentifier: "th-1",
        commentData: {
          commentId: "r-1",
          postId: "post-1",
          parentId: "post-1",
          fromId: "ann.b",
          fromName: "Ann.B",
          message: "hi",
          createdTime: RECENT_SECONDS,
        },
      },
    ])
  })
})

describe("scanPostComments — tiktok", () => {
  test("normalizes the parent sentinel, flattens replies and skips the owner", async () => {
    mockTiktokListByWorkspace.mockResolvedValue([
      {
        openId: "open-1",
        auth: {
          tokens: { accessToken: "token" },
          metadata: { openId: "open-1" },
        },
      },
    ])
    mockListTiktokComments.mockResolvedValue({
      comments: [
        {
          comment_id: "c-1",
          video_id: "video-1",
          unique_identifier: "ann",
          create_time: RECENT_SECONDS,
          text: "top",
          parent_comment_id: "0",
          reply_list: [
            {
              comment_id: "c-2",
              video_id: "video-1",
              unique_identifier: "bob",
              create_time: RECENT_SECONDS,
              parent_comment_id: "c-1",
            },
            {
              comment_id: "c-3",
              video_id: "video-1",
              unique_identifier: "shop",
              create_time: RECENT_SECONDS,
              parent_comment_id: "c-1",
              owner: true,
            },
          ],
        },
      ],
      has_more: false,
    })

    const result = await scanPostComments({
      type: "tiktok",
      workspaceId: "ws-1",
      postId: "video-1",
      since: SINCE,
    })

    expect(mockListTiktokComments).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        businessId: "open-1",
        videoId: "video-1",
        includeReplies: true,
        sortType: "DESC",
      }),
    )
    expect(result.map((comment) => comment.commentData)).toEqual([
      {
        commentId: "c-1",
        postId: "video-1",
        parentId: undefined,
        fromId: "ann",
        message: "top",
        createdTime: RECENT_SECONDS,
      },
      {
        commentId: "c-2",
        postId: "video-1",
        parentId: "c-1",
        fromId: "bob",
        message: undefined,
        createdTime: RECENT_SECONDS,
      },
    ])
    expect(result[0]?.integrationIdentifier).toBe("open-1")
  })

  test("stops paging at the page cap", async () => {
    mockTiktokListByWorkspace.mockResolvedValue([
      {
        openId: "open-1",
        auth: {
          tokens: { accessToken: "token" },
          metadata: { openId: "open-1" },
        },
      },
    ])
    mockListTiktokComments.mockResolvedValue({
      comments: [],
      cursor: 30,
      has_more: true,
    })

    await scanPostComments({
      type: "tiktok",
      workspaceId: "ws-1",
      postId: "video-1",
      since: SINCE,
    })

    expect(mockListTiktokComments).toHaveBeenCalledTimes(
      MISSED_COMMENTS_MAX_PAGES,
    )
  })
})
