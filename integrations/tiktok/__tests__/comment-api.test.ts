import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.fn()
const post = vi.fn()
const postFormData = vi.fn()

vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ get, post, postFormData }),
}))

const {
  createComment,
  deleteComment,
  hideComment,
  likeComment,
  listTiktokCommentReplies,
  listTiktokComments,
  replyToComment,
  uploadCommentImage,
} = await import("../src/apis/comment")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listTiktokComments", () => {
  test("sends every filter as a query param, arrays as JSON", async () => {
    get.mockResolvedValueOnce({ code: 0, data: { comments: [] } })

    await listTiktokComments("token", {
      businessId: "biz-1",
      videoId: "7203946942097902849",
      commentIds: ["7247303576418566913"],
      includeReplies: true,
      status: "PUBLIC",
      sortType: "DESC",
      cursor: 0,
      maxCount: 20,
    })

    expect(get).toHaveBeenCalledWith("business/comment/list/", {
      searchParams: {
        business_id: "biz-1",
        video_id: "7203946942097902849",
        comment_ids: '["7247303576418566913"]',
        include_replies: "true",
        status: "PUBLIC",
        sort_type: "DESC",
        cursor: "0",
        max_count: "20",
      },
    })
  })

  test("omits params the caller left undefined", async () => {
    get.mockResolvedValueOnce({ code: 0, data: {} })

    await listTiktokComments("token", {
      businessId: "biz-1",
      videoId: "video-1",
    })

    expect(get).toHaveBeenCalledWith("business/comment/list/", {
      searchParams: { business_id: "biz-1", video_id: "video-1" },
    })
  })

  test("returns the comments when TikTok accepts the call", async () => {
    const comments = [{ comment_id: "c-1", video_id: "video-1" }]
    get.mockResolvedValueOnce({ code: 0, data: { comments, has_more: false } })

    await expect(
      listTiktokComments("token", { businessId: "biz-1", videoId: "video-1" }),
    ).resolves.toEqual({ comments, has_more: false })
  })

  // The Business API answers HTTP 200 on a rejection, so a non-zero `code` is
  // the only signal that nothing was read.
  test("throws on a non-zero code instead of reporting an empty list", async () => {
    get.mockResolvedValueOnce({
      code: 40_001,
      message: "Permission denied",
      data: null,
    })

    await expect(
      listTiktokComments("token", { businessId: "biz-1", videoId: "video-1" }),
    ).rejects.toThrow("Permission denied")
  })
})

describe("listTiktokCommentReplies", () => {
  test("addresses the reply list by comment id", async () => {
    get.mockResolvedValueOnce({ code: 0, data: { comments: [] } })

    await listTiktokCommentReplies("token", {
      businessId: "biz-1",
      videoId: "video-1",
      commentId: "comment-1",
      status: "ALL",
    })

    expect(get).toHaveBeenCalledWith("business/comment/reply/list/", {
      searchParams: {
        business_id: "biz-1",
        video_id: "video-1",
        comment_id: "comment-1",
        status: "ALL",
      },
    })
  })
})

describe("createComment", () => {
  test("posts the text and returns the created comment", async () => {
    const created = { comment_id: "c-1", video_id: "video-1" }
    post.mockResolvedValueOnce({ code: 0, data: created })

    await expect(
      createComment("token", {
        businessId: "biz-1",
        videoId: "video-1",
        text: "hello",
      }),
    ).resolves.toEqual(created)

    expect(post).toHaveBeenCalledWith("business/comment/create/", {
      json: {
        business_id: "biz-1",
        video_id: "video-1",
        text: "hello",
        image_uri: undefined,
        image_width: undefined,
        image_height: undefined,
      },
    })
  })
})

describe("replyToComment", () => {
  test("anchors the reply to the comment it answers", async () => {
    post.mockResolvedValueOnce({
      code: 0,
      data: { comment_id: "reply-1", video_id: "video-1" },
    })

    await replyToComment("token", {
      businessId: "biz-1",
      videoId: "video-1",
      commentId: "comment-1",
      text: "thanks!",
      imageUri: "img-1",
      imageWidth: 100,
      imageHeight: 200,
    })

    expect(post).toHaveBeenCalledWith("business/comment/reply/create/", {
      json: {
        business_id: "biz-1",
        video_id: "video-1",
        comment_id: "comment-1",
        text: "thanks!",
        image_uri: "img-1",
        image_width: 100,
        image_height: 200,
      },
    })
  })

  test("throws on a non-zero code", async () => {
    post.mockResolvedValueOnce({
      code: 40_002,
      message: "Comment not found",
      data: null,
    })

    await expect(
      replyToComment("token", {
        businessId: "biz-1",
        videoId: "video-1",
        commentId: "comment-1",
        text: "thanks!",
      }),
    ).rejects.toThrow("Comment not found")
  })
})

describe("likeComment", () => {
  // `business/comment/like/` is the one comment endpoint with no video_id.
  test("sends no video_id", async () => {
    post.mockResolvedValueOnce({ code: 0, data: null })

    await likeComment("token", {
      businessId: "biz-1",
      commentId: "comment-1",
      action: "LIKE",
    })

    expect(post).toHaveBeenCalledWith("business/comment/like/", {
      json: {
        business_id: "biz-1",
        comment_id: "comment-1",
        action: "LIKE",
      },
    })
  })
})

describe("hideComment", () => {
  test("sends the video id alongside the comment id", async () => {
    post.mockResolvedValueOnce({ code: 0, data: null })

    await hideComment("token", {
      businessId: "biz-1",
      videoId: "video-1",
      commentId: "comment-1",
      action: "HIDE",
    })

    expect(post).toHaveBeenCalledWith("business/comment/hide/", {
      json: {
        business_id: "biz-1",
        video_id: "video-1",
        comment_id: "comment-1",
        action: "HIDE",
      },
    })
  })

  test("throws on a non-zero code so a failed hide is never reported as done", async () => {
    post.mockResolvedValueOnce({
      code: 40_100,
      message: "Not authorized",
      data: null,
    })

    await expect(
      hideComment("token", {
        businessId: "biz-1",
        videoId: "video-1",
        commentId: "comment-1",
        action: "HIDE",
      }),
    ).rejects.toThrow("Not authorized")
  })
})

describe("deleteComment", () => {
  test("sends no video_id", async () => {
    post.mockResolvedValueOnce({ code: 0, data: null })

    await deleteComment("token", {
      businessId: "biz-1",
      commentId: "comment-1",
    })

    expect(post).toHaveBeenCalledWith("business/comment/delete/", {
      json: { business_id: "biz-1", comment_id: "comment-1" },
    })
  })
})

describe("uploadCommentImage", () => {
  const stubFetchOk = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["image"])),
      }),
    )
  }

  test("returns the image_uri the comment endpoints need", async () => {
    stubFetchOk()
    postFormData.mockResolvedValueOnce({
      code: 0,
      data: { image_uri: "uri-1", width: 10, height: 20 },
    })

    await expect(
      uploadCommentImage("token", {
        businessId: "biz-1",
        imageUrl: "https://example.com/a.png",
      }),
    ).resolves.toEqual({ image_uri: "uri-1", width: 10, height: 20 })
  })

  test("throws when the response carries no image_uri", async () => {
    stubFetchOk()
    postFormData.mockResolvedValueOnce({ code: 0, data: {} })

    await expect(
      uploadCommentImage("token", {
        businessId: "biz-1",
        imageUrl: "https://example.com/a.png",
      }),
    ).rejects.toThrow("No image_uri")
  })

  test("throws when the source image cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    await expect(
      uploadCommentImage("token", {
        businessId: "biz-1",
        imageUrl: "https://example.com/a.png",
      }),
    ).rejects.toThrow("Failed to fetch image")
  })
})
