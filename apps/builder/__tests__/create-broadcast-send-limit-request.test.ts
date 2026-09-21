import { broadcastSendLimitIssues } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { createBroadcastRequest } from "@/features/broadcasts/schema/action"

const base = {
  channel: "telegram",
  flowId: "1",
  subaction: "allContacts",
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
}

describe("createBroadcastRequest send limit fields", () => {
  test("accepts audienceRangeStart, audienceRangeEnd, and sendRatePerMinute", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      audienceRangeStart: 1,
      audienceRangeEnd: 100,
      sendRatePerMinute: 750,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.audienceRangeStart).toBe(1)
      expect(result.data.audienceRangeEnd).toBe(100)
      expect(result.data.sendRatePerMinute).toBe(750)
    }
  })

  test("defaults the three fields to undefined when omitted", () => {
    const result = createBroadcastRequest.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.audienceRangeStart).toBeUndefined()
      expect(result.data.audienceRangeEnd).toBeUndefined()
      expect(result.data.sendRatePerMinute).toBeUndefined()
    }
  })

  test("rejects a sendRatePerMinute of 0", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      sendRatePerMinute: 0,
    })
    expect(result.success).toBe(false)
  })

  test("rejects a sendRatePerMinute of 1001 (above the max)", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      sendRatePerMinute: 1001,
    })
    expect(result.success).toBe(false)
  })

  test("accepts a sendRatePerMinute of 1000 (the max)", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      sendRatePerMinute: 1000,
    })
    expect(result.success).toBe(true)
  })

  test("rejects audienceRangeEnd before audienceRangeStart on the virtual audienceRange path", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      audienceRangeStart: 10,
      audienceRangeEnd: 5,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["audienceRange"])
    expect(result.error?.issues[0]?.message).toBe(
      broadcastSendLimitIssues.rangeEndBeforeStart,
    )
  })

  test("accepts audienceRangeEnd equal to audienceRangeStart", () => {
    const result = createBroadcastRequest.safeParse({
      ...base,
      audienceRangeStart: 10,
      audienceRangeEnd: 10,
    })
    expect(result.success).toBe(true)
  })
})
