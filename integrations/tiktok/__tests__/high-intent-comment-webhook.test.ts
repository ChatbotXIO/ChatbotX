import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  parseTiktokHighIntentCommentContent,
  TIKTOK_HIGH_INTENT_COMMENT_EVENT,
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

// 19 digits, past Number.MAX_SAFE_INTEGER — the same fixture the comment.update
// suite uses, so a regression in snowflake handling shows up as a changed id.
const COMMENT_ID = "7247303576418566913"

// TikTok documents `comment_id` as a string here but sends it as an unquoted
// JSON number on `comment.update`. Building the fixture with a JS number would
// round it before the test ran, so raw text is spliced in instead.
const rawNumber = (value: string) => `__RAW__${value}__RAW__`
const toJson = (payload: Record<string, unknown>) =>
  JSON.stringify(payload).replace(/"__RAW__(.+?)__RAW__"/g, "$1")

const buildContent = (overrides: Record<string, unknown> = {}) =>
  toJson({
    from: "commenter",
    to: "business",
    unique_identifier: "+ABc1D2/E0fGhijkl",
    from_user: { id: "+ABc1D2/E0fGhijkl", role: "personal_account" },
    to_user: { id: "open-1", role: "business_account" },
    comment_id: rawNumber(COMMENT_ID),
    comment_text: "how much is this?",
    is_follower: true,
    timestamp: 1_687_394_416_109,
    ...overrides,
  })

describe("parseTiktokHighIntentCommentContent", () => {
  test("keeps the snowflake comment id exact", () => {
    const parsed = parseTiktokHighIntentCommentContent(buildContent())

    expect(parsed?.comment_id).toBe(COMMENT_ID)
    expect(parsed?.comment_text).toBe("how much is this?")
    expect(parsed?.is_follower).toBe(true)
  })

  // Proves the quoting is not vacuous: the raw id really is beyond what a plain
  // parse can represent.
  test("a plain JSON.parse would corrupt the same id", () => {
    const naive = JSON.parse(buildContent()) as { comment_id: number }

    expect(String(naive.comment_id)).not.toBe(COMMENT_ID)
  })

  test("accepts the id already quoted, as the docs show it", () => {
    const parsed = parseTiktokHighIntentCommentContent(
      JSON.stringify({ comment_id: COMMENT_ID }),
    )

    expect(parsed?.comment_id).toBe(COMMENT_ID)
  })

  test("returns undefined for content that cannot be understood", () => {
    expect(parseTiktokHighIntentCommentContent("not json")).toBeUndefined()
    expect(
      parseTiktokHighIntentCommentContent(JSON.stringify({ text: "hi" })),
    ).toBeUndefined()
  })
})

describe("webhookHandler high-intent comment routing", () => {
  const queueAdd = vi.fn()
  const SECRET = "client-secret"

  const buildRequest = (content: string, userOpenid = "open-1") => {
    const body = JSON.stringify({
      client_key: "key-1",
      event: TIKTOK_HIGH_INTENT_COMMENT_EVENT,
      create_time: 1_615_338_610,
      user_openid: userOpenid,
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

  const run = (content: string, config: Record<string, unknown> = {}) =>
    webhookHandler({
      req: buildRequest(content),
      config: { clientSecret: SECRET, ...config } as never,
      queue: { add: queueAdd } as never,
    } as never)

  beforeEach(() => {
    vi.clearAllMocks()
    hmacSha256Hex.mockResolvedValue("deadbeef")
  })

  test("enqueues tiktokHighIntentComment with the id intact", async () => {
    await expect(run(buildContent())).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledWith(
      "tiktokHighIntentComment",
      {
        type: "tiktokHighIntentComment",
        data: {
          integrationType: "tiktok",
          integrationIdentifier: "open-1",
          commentId: COMMENT_ID,
          commentText: "how much is this?",
          uniqueIdentifier: "+ABc1D2/E0fGhijkl",
          isFollower: true,
          // 1687394416109ms → seconds
          commentedAt: 1_687_394_416,
        },
      },
      expect.objectContaining({ attempts: 6 }),
    )
  })

  // The comment this flag belongs to may not be ingested yet — the COMMENT
  // subscription has its own delivery window — so the job must be retried
  // rather than dropped.
  test("gives the job a backoff so it can outlast a late comment.update", async () => {
    await run(buildContent())

    const [, , options] = queueAdd.mock.calls[0]
    expect(options).toMatchObject({
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
    })
  })

  test("falls back to the envelope create_time when the content has no timestamp", async () => {
    await run(buildContent({ timestamp: undefined }))

    expect(queueAdd.mock.calls[0][1].data.commentedAt).toBe(1_615_338_610)
  })

  test("prefers the configured openId over the envelope's user_openid", async () => {
    await run(buildContent(), { openId: "configured-open-id" })

    expect(queueAdd.mock.calls[0][1].data.integrationIdentifier).toBe(
      "configured-open-id",
    )
  })

  // TikTok retries any non-2xx, and an unparseable payload will never improve.
  test("answers ok and enqueues nothing when the content cannot be parsed", async () => {
    await expect(run("not json")).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalled()
  })
})
