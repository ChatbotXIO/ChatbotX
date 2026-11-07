import { describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { decodeRef, encodeRef } = await import("../src/referral/utils")

const POLL_REF_PATTERN = /^pl_[0-9A-Za-z]+$/

describe("poll ref", () => {
  test("round-trips a poll ref", () => {
    expect(encodeRef({ type: "poll", pollId: "834181" })).toMatch(
      POLL_REF_PATTERN,
    )
    expect(decodeRef(encodeRef({ type: "poll", pollId: "834181" }))).toEqual({
      type: "poll",
      pollId: "834181",
    })
  })

  test("rejects an empty poll segment", () => {
    expect(decodeRef("pl_")).toBeUndefined()
  })
})
