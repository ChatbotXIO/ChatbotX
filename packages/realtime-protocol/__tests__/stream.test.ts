import { describe, expect, test } from "vitest"
import { isRealtimeSeqAfter } from "../src/stream"

describe("isRealtimeSeqAfter", () => {
  test("a newer millisecond component wins regardless of sequence", () => {
    expect(isRealtimeSeqAfter("11-0", "10-5")).toBe(true)
    expect(isRealtimeSeqAfter("10-5", "11-0")).toBe(false)
  })

  test("an equal millisecond component compares the sequence", () => {
    expect(isRealtimeSeqAfter("10-5", "10-4")).toBe(true)
    expect(isRealtimeSeqAfter("10-4", "10-5")).toBe(false)
  })

  test("an identical id is not after itself", () => {
    expect(isRealtimeSeqAfter("10-5", "10-5")).toBe(false)
  })

  test("compares the numeric value, not the string, of each component", () => {
    // A naive string comparison would rank "9-0" after "10-0" because "9" >
    // "1" lexicographically; BigInt parsing must rank it before.
    expect(isRealtimeSeqAfter("10-0", "9-0")).toBe(true)
    expect(isRealtimeSeqAfter("9-0", "10-0")).toBe(false)
  })
})
