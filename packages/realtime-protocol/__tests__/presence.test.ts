import { describe, expect, it } from "vitest"
import {
  hashPresenceUserIds,
  MAX_PRESENCE_USER_IDS_PER_REPORT,
  PRESENCE_REPORT_INTERVAL_MS,
  PRESENCE_TTL_MS,
  truncatePresenceUserIds,
} from "../src/presence"

const HEX_SHA256_RE = /^[0-9a-f]{64}$/

describe("presence config invariant", () => {
  it("keeps the report interval at most half the TTL — one slow/lost report must never flap a member offline (HIGH-1)", () => {
    expect(PRESENCE_REPORT_INTERVAL_MS * 2).toBeLessThanOrEqual(PRESENCE_TTL_MS)
  })
})

describe("truncatePresenceUserIds", () => {
  it("passes a batch under the cap through unchanged", () => {
    expect(truncatePresenceUserIds(["a", "b"])).toEqual(["a", "b"])
  })

  it("truncates a batch over the cap instead of rejecting it (LOW-7)", () => {
    const userIds = Array.from(
      { length: MAX_PRESENCE_USER_IDS_PER_REPORT + 10 },
      (_, i) => `u_${i}`,
    )

    const result = truncatePresenceUserIds(userIds)

    expect(result).toHaveLength(MAX_PRESENCE_USER_IDS_PER_REPORT)
    expect(result).toEqual(userIds.slice(0, MAX_PRESENCE_USER_IDS_PER_REPORT))
  })
})

describe("hashPresenceUserIds", () => {
  it("is order-independent (sorts before hashing)", async () => {
    await expect(hashPresenceUserIds(["a", "b"])).resolves.toBe(
      await hashPresenceUserIds(["b", "a"]),
    )
  })

  it("changes when the member set changes", async () => {
    const hashA = await hashPresenceUserIds(["a", "b"])
    const hashB = await hashPresenceUserIds(["a", "c"])

    expect(hashA).not.toBe(hashB)
  })

  it("returns a deterministic hex sha256 digest", async () => {
    const hash = await hashPresenceUserIds(["a", "b"])

    expect(hash).toMatch(HEX_SHA256_RE)
  })
})
