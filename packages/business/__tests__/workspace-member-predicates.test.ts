import { describe, expect, test } from "vitest"
import { isSupportAccessEnabled } from "../src/workspace-member/predicates"

describe("isSupportAccessEnabled", () => {
  test("returns false when supportAccessUntil is null", () => {
    expect(isSupportAccessEnabled({ supportAccessUntil: null })).toBe(false)
  })

  test("returns false when supportAccessUntil is in the past", () => {
    const past = new Date(Date.now() - 60_000)
    expect(isSupportAccessEnabled({ supportAccessUntil: past })).toBe(false)
  })

  test("returns true when supportAccessUntil is in the future", () => {
    const future = new Date(Date.now() + 60_000)
    expect(isSupportAccessEnabled({ supportAccessUntil: future })).toBe(true)
  })
})
