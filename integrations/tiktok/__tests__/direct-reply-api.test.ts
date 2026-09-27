import { describe, expect, test, vi } from "vitest"

const get = vi.fn()
const post = vi.fn()
const createTiktokBusinessClient = vi.fn(() => ({ get, post }))

vi.mock("../src/lib/http-client", () => ({ createTiktokBusinessClient }))

const { getTiktokDirectReplyStatus, updateTiktokDirectReplyStatus } =
  await import("../src/apis/direct-reply")

const BUSINESS_ID = "business-1"

const NOT_ELIGIBLE_MESSAGE = /not eligible for Comment-to-Message/

describe("getTiktokDirectReplyStatus", () => {
  test("asks for the Comment-to-Message setting of this business account", async () => {
    get.mockResolvedValueOnce({
      code: 0,
      data: { operation_status: "ENABLE" },
    })

    await expect(
      getTiktokDirectReplyStatus("token", BUSINESS_ID),
    ).resolves.toBe("ENABLE")

    expect(createTiktokBusinessClient).toHaveBeenCalledWith("token")
    expect(get).toHaveBeenCalledWith("business/message/direct_reply/get/", {
      searchParams: {
        business_id: BUSINESS_ID,
        direct_reply_type: "COMMENT_TO_MESSAGE",
      },
    })
  })

  // A connection that has never been checked must read as "unknown", not as a
  // confident "disabled" — the two need different wording in the UI.
  test("returns undefined when TikTok reports no status", async () => {
    get.mockResolvedValueOnce({ code: 0, data: {} })

    await expect(
      getTiktokDirectReplyStatus("token", BUSINESS_ID),
    ).resolves.toBeUndefined()
  })

  test("throws on a non-zero code even though the HTTP call succeeded", async () => {
    get.mockResolvedValueOnce({
      code: 40_100,
      message: "Access denied",
      data: null,
    })

    await expect(
      getTiktokDirectReplyStatus("token", BUSINESS_ID),
    ).rejects.toThrow("Access denied")
  })
})

describe("updateTiktokDirectReplyStatus", () => {
  test("enables Comment-to-Message for the business account", async () => {
    post.mockResolvedValueOnce({ code: 0, data: {} })

    await updateTiktokDirectReplyStatus("token", BUSINESS_ID, "ENABLE")

    expect(post).toHaveBeenCalledWith("business/message/direct_reply/update/", {
      json: {
        business_id: BUSINESS_ID,
        direct_reply_type: "COMMENT_TO_MESSAGE",
        operation_status: "ENABLE",
      },
    })
  })

  test("disables it with the same shape", async () => {
    post.mockResolvedValueOnce({ code: 0, data: {} })

    await updateTiktokDirectReplyStatus("token", BUSINESS_ID, "DISABLE")

    const [, options] = post.mock.calls.at(-1) as [string, { json: unknown }]
    expect(options.json).toMatchObject({ operation_status: "DISABLE" })
  })

  // The eligibility rejection (not registered in VN/ID/TH, owner under 18,
  // messaging permissions not set to "Requests") arrives only as this string.
  test("surfaces the eligibility rejection verbatim", async () => {
    post.mockResolvedValueOnce({
      code: 40_002,
      message:
        "The business account is not eligible for Comment-to-Message in its region",
      data: null,
    })

    await expect(
      updateTiktokDirectReplyStatus("token", BUSINESS_ID, "ENABLE"),
    ).rejects.toThrow(NOT_ELIGIBLE_MESSAGE)
  })
})
