import { describe, expect, test } from "vitest"
import {
  type FBCommentReply,
  normalizeReplyTexts,
  resolveReplyTexts,
} from "../src/partials/fb-comment-automation"

/**
 * These two are the only places that know how a `text` reply's messages are
 * stored. `willSendReply` and `executePublicReply` both read through
 * `resolveReplyTexts`; disagreeing there means an automation either replies
 * twice or goes silent with no log.
 */

describe("resolveReplyTexts", () => {
  test("prefers the message list", () => {
    expect(
      resolveReplyTexts({
        type: "text",
        value: "stale",
        values: [{ value: "a" }, { value: "b" }],
      }),
    ).toEqual(["a", "b"])
  })

  test("falls back to the legacy single value — every row predating the list has only this", () => {
    expect(resolveReplyTexts({ type: "text", value: "legacy" })).toEqual([
      "legacy",
    ])
  })

  test("trims and drops blanks so an empty editor never posts an empty comment", () => {
    expect(
      resolveReplyTexts({
        type: "text",
        value: "",
        values: [{ value: "  kept  " }, { value: "   " }, { value: "" }],
      }),
    ).toEqual(["kept"])
  })

  test("returns nothing for an unset reply", () => {
    expect(resolveReplyTexts({ type: "text", value: null })).toEqual([])
    expect(resolveReplyTexts({ type: "text", value: "", values: [] })).toEqual(
      [],
    )
  })
})

describe("normalizeReplyTexts", () => {
  test("mirrors the first message onto `value`, so anything still reading it sees real content", () => {
    const result = normalizeReplyTexts({
      type: "text",
      value: "stale",
      values: [{ value: "a" }, { value: "b" }],
    })
    expect(result.value).toBe("a")
    expect(result.values).toEqual([{ value: "a" }, { value: "b" }])
  })

  test("builds the list from a legacy payload, so a client sending only `value` is not ignored", () => {
    // Without this, `resolveReplyTexts` would keep preferring a stale `values`
    // and the update would silently do nothing.
    expect(normalizeReplyTexts({ type: "text", value: "only" })).toEqual({
      type: "text",
      value: "only",
      values: [{ value: "only" }],
    })
  })

  test("leaves non-text replies alone — `value` there is a flow or agent id", () => {
    const flow: FBCommentReply = { type: "flow", value: "flow-1" }
    expect(normalizeReplyTexts(flow)).toBe(flow)
  })
})
