import { describe, expect, it } from "vitest"
import {
  hashPresenceUserIds,
  MAX_PRESENCE_USER_IDS_PER_REPORT,
  PRESENCE_PING_MESSAGE_TYPE,
  PRESENCE_REPORT_INTERVAL_MS,
  PRESENCE_TTL_MS,
  presencePingMessageSchema,
  serializePresencePingMessage,
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

describe("presence ping message (client keep-alive liveness signal)", () => {
  it("serializes to a frame that round-trips through the schema", () => {
    const frame = serializePresencePingMessage()

    const parsed = presencePingMessageSchema.safeParse(JSON.parse(frame))

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.type).toBe(PRESENCE_PING_MESSAGE_TYPE)
  })

  it("rejects a frame with the wrong type literal", () => {
    const result = presencePingMessageSchema.safeParse({ type: "not-a-ping" })

    expect(result.success).toBe(false)
  })

  it("rejects malformed/unrelated payloads", () => {
    expect(presencePingMessageSchema.safeParse(null).success).toBe(false)
    expect(presencePingMessageSchema.safeParse("presence-ping").success).toBe(
      false,
    )
    expect(presencePingMessageSchema.safeParse({}).success).toBe(false)
    expect(
      presencePingMessageSchema.safeParse({ eventType: "typing" }).success,
    ).toBe(false)
  })
})
