import { describe, expect, test } from "vitest"
import { publicBroadcastResource } from "@/features/broadcasts/schema/resource"

describe("publicBroadcastResource send limit fields", () => {
  test("includes audienceRangeStart, audienceRangeEnd, and sendRatePerMinute", () => {
    expect(Object.keys(publicBroadcastResource.shape)).toEqual(
      expect.arrayContaining([
        "audienceRangeStart",
        "audienceRangeEnd",
        "sendRatePerMinute",
      ]),
    )
  })

  test("parses a row carrying send limit values", () => {
    const result = publicBroadcastResource.safeParse({
      id: "1",
      name: "Broadcast",
      status: "scheduled",
      schedulesType: "now",
      schedulesAt: new Date(),
      flowId: null,
      contactCount: null,
      audienceRangeStart: 1,
      audienceRangeEnd: 500,
      sendRatePerMinute: 250,
    })
    expect(result.success).toBe(true)
  })
})
