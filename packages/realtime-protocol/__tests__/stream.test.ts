import { describe, expect, test } from "vitest"
import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  isRealtimeSeqAfter,
  realtimeStreamRecordSchema,
} from "../src/stream"

describe("workspace stream sharding", () => {
  test("keeps established workspace IDs on stable Redis hash-tagged shards", () => {
    expect(getRealtimeStreamShard("workspace-1")).toBe(249)
    expect(getRealtimeStreamKey("workspace-1")).toBe("rt:{249}")
    expect(getRealtimeStreamShard("workspace-abc")).toBe(42)
    expect(getRealtimeStreamKey("ws-1")).toBe("rt:{128}")
  })
})

describe("member revoke stream records", () => {
  test("requires the original revocation cutoff", () => {
    const record = {
      kind: "member-revoke",
      reason: "reauth",
      revokedAtMs: 1000,
      userId: "user-1",
      workspaceId: "workspace-1",
    }

    expect(realtimeStreamRecordSchema.parse(record)).toEqual(record)
    expect(() =>
      realtimeStreamRecordSchema.parse({
        ...record,
        revokedAtMs: undefined,
      }),
    ).toThrow()
  })
})
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
