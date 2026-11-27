import { describe, expect, test } from "vitest"
import { z } from "zod"
import { ChannelError, ChannelErrorCategory } from "../src"
import {
  decodePostCommentCursor,
  encodePostCommentCursor,
} from "../src/lib/post-comment-cursor"

const OPAQUE_CURSOR = /^[A-Za-z0-9_-]+$/

const schema = z.object({ top: z.string().nullable(), n: z.number() })

describe("post comment cursor", () => {
  test("round-trips a position through an opaque string", () => {
    const cursor = encodePostCommentCursor({ top: "abc", n: 2 })

    expect(cursor).toMatch(OPAQUE_CURSOR)
    expect(decodePostCommentCursor(cursor, schema)).toEqual({
      top: "abc",
      n: 2,
    })
  })

  test("round-trips non-ASCII text", () => {
    const position = { top: "dấu-tiếng-việt-🙂", n: 1 }

    const cursor = encodePostCommentCursor(position)

    expect(cursor).toMatch(OPAQUE_CURSOR)
    expect(decodePostCommentCursor(cursor, schema)).toEqual(position)
  })

  test.each([
    ["not base64url json", "%%%not-a-cursor%%%"],
    ["json of the wrong shape", encodePostCommentCursor({ top: 1 })],
    ["empty payload", ""],
  ])("rejects %s as a permanent PAYLOAD_INVALID error", (_name, cursor) => {
    const run = () => decodePostCommentCursor(cursor, schema)

    expect(run).toThrow(ChannelError)
    try {
      run()
    } catch (error) {
      expect((error as ChannelError).category).toBe(
        ChannelErrorCategory.PAYLOAD_INVALID,
      )
      expect((error as ChannelError).isRetryable).toBe(false)
    }
  })
})
