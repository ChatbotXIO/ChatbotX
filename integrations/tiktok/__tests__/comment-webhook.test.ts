import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  parseTiktokCommentEventContent,
  TIKTOK_COMMENT_EVENT,
} from "../src/schema"

const hmacSha256Hex = vi.fn()

vi.mock("../src/lib/webhook", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/webhook")>(
      "../src/lib/webhook",
    )
  return { ...actual, hmacSha256Hex }
})

const { webhookHandler } = await import("../src/handlers/webhook")

// A real TikTok comment id: 19 digits, well past Number.MAX_SAFE_INTEGER
// (9007199254740991). Kept as the fixture everywhere so a regression in the
// snowflake handling shows up as a changed id, not a vague failure.
const COMMENT_ID = "7247303576418566913"
const VIDEO_ID = "7203946942097902849"
const PARENT_COMMENT_ID = "7235861947622916866"

// TikTok sends these ids as UNQUOTED JSON numbers. Building the fixture with
// JS numbers would round them before the test even ran, making the whole suite
// pass against a payload no TikTok server would send — so the ids are spliced
// into the JSON as raw text instead.
const rawNumber = (value: string) => `__RAW__${value}__RAW__`
const toJson = (payload: Record<string, unknown>) =>
  JSON.stringify(payload).replace(/"__RAW__(.+?)__RAW__"/g, "$1")

const buildContent = (overrides: Record<string, unknown> = {}) =>
  toJson({
    comment_id: rawNumber(COMMENT_ID),
    video_id: rawNumber(VIDEO_ID),
    comment_type: "comment",
    comment_action: "insert",
    unique_identifier: "+ABc1D2/E0fGhijkl",
    timestamp: 1_687_394_416_109,
    text: "nice video",
    ...overrides,
  })

describe("parseTiktokCommentEventContent", () => {
  test("keeps snowflake ids exact instead of letting JSON.parse round them", () => {
    const parsed = parseTiktokCommentEventContent(
      buildContent({ parent_comment_id: rawNumber(PARENT_COMMENT_ID) }),
    )

    expect(parsed?.comment_id).toBe(COMMENT_ID)
    expect(parsed?.video_id).toBe(VIDEO_ID)
    expect(parsed?.parent_comment_id).toBe(PARENT_COMMENT_ID)
  })

  // Guards the reason the quoting exists at all: proves the ids really are
  // beyond what a plain parse can represent, so the test above is not vacuous.
  test("a plain JSON.parse would corrupt the same ids", () => {
    const naive = JSON.parse(buildContent()) as {
      comment_id: number
      video_id: number
    }

    expect(String(naive.comment_id)).not.toBe(COMMENT_ID)
    expect(String(naive.video_id)).not.toBe(VIDEO_ID)
  })

  test("accepts ids TikTok already sent as strings", () => {
    const parsed = parseTiktokCommentEventContent(
      JSON.stringify({
        comment_id: COMMENT_ID,
        video_id: VIDEO_ID,
        comment_action: "insert",
      }),
    )

    expect(parsed?.comment_id).toBe(COMMENT_ID)
  })

  test("leaves the millisecond timestamp a number", () => {
    expect(parseTiktokCommentEventContent(buildContent())?.timestamp).toBe(
      1_687_394_416_109,
    )
  })

  test("returns undefined on malformed JSON rather than throwing", () => {
    expect(parseTiktokCommentEventContent("{not json")).toBeUndefined()
  })

  test("returns undefined on an unknown comment_action", () => {
    expect(
      parseTiktokCommentEventContent(
        buildContent({ comment_action: "set_to_something_new" }),
      ),
    ).toBeUndefined()
  })
})

describe("webhookHandler comment routing", () => {
  const queueAdd = vi.fn()
  const SECRET = "client-secret"

  const buildRequest = (content: string, event = TIKTOK_COMMENT_EVENT) => {
    const body = JSON.stringify({
      client_key: "key-1",
      event,
      create_time: 1_615_338_610,
      user_openid: "open-1",
      content,
    })
    const timestamp = Math.floor(Date.now() / 1000)
    return {
      text: () => Promise.resolve(body),
      headers: {
        get: (name: string) =>
          name === "TikTok-Signature" ? `t=${timestamp},s=deadbeef` : null,
      },
    } as unknown as Request
  }

  const run = (content: string, event?: string) =>
    webhookHandler({
      req: buildRequest(content, event),
      config: { clientSecret: SECRET } as never,
      queue: { add: queueAdd } as never,
    } as never)

  beforeEach(() => {
    vi.clearAllMocks()
    hmacSha256Hex.mockResolvedValue("deadbeef")
  })

  test("enqueues incomingComment for a new comment, ids intact", async () => {
    await expect(run(buildContent())).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledWith("incomingComment", {
      type: "incomingComment",
      data: {
        integrationType: "tiktok",
        integrationIdentifier: "open-1",
        commentData: {
          commentId: COMMENT_ID,
          postId: VIDEO_ID,
          parentId: undefined,
          fromId: "+ABc1D2/E0fGhijkl",
          message: "nice video",
          // 1687394416109ms → seconds
          createdTime: 1_687_394_416,
        },
      },
    })
  })

  test("carries the parent id through so a reply can be told from a comment", async () => {
    await run(
      buildContent({
        comment_type: "reply",
        parent_comment_id: rawNumber(PARENT_COMMENT_ID),
      }),
    )

    expect(queueAdd.mock.calls[0][1].data.commentData.parentId).toBe(
      PARENT_COMMENT_ID,
    )
  })

  test("falls back to the envelope create_time when the comment has no timestamp", async () => {
    await run(buildContent({ timestamp: undefined }))

    expect(queueAdd.mock.calls[0][1].data.commentData.createdTime).toBe(
      1_615_338_610,
    )
  })

  test("enqueues deleteIncomingComment when the comment was deleted", async () => {
    await run(buildContent({ comment_action: "delete" }))

    expect(queueAdd).toHaveBeenCalledWith("deleteIncomingComment", {
      type: "deleteIncomingComment",
      data: {
        integrationType: "tiktok",
        integrationIdentifier: "open-1",
        commentId: COMMENT_ID,
      },
    })
  })

  // updateIncomingComment rewrites the message text, which is not what a
  // visibility change alters — so these are dropped rather than mis-routed.
  test.each([
    "set_to_hidden",
    "set_to_friends_only",
    "set_to_public",
  ])("enqueues nothing for %s", async (action) => {
    await expect(run(buildContent({ comment_action: action }))).resolves.toBe(
      "ok",
    )

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("answers ok without enqueuing when the content cannot be parsed", async () => {
    await expect(run("{not json")).resolves.toBe("ok")
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("still routes direct messages, untouched by the comment branch", async () => {
    await run(
      JSON.stringify({
        from_user: { id: "user-1" },
        conversation_id: "conv-1",
        type: "text",
        text: { body: "hi" },
      }),
      "im_receive_msg",
    )

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      undefined,
    )
  })
})
