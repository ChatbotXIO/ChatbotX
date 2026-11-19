import { describe, expect, test } from "vitest"
import {
  broadcastEventType,
  getBroadcastStatsResponse,
  isContactInfoCaptureEvent,
} from "../src/schemas/broadcast-stats"

describe("broadcast stats schema — contact-info capture events", () => {
  test("the broadcast event type accepts both capture events next to the delivery events", () => {
    for (const eventType of [
      "message:delivered",
      "flow:clicked",
      "contactInfo:phoneCaptured",
      "contactInfo:emailCaptured",
    ]) {
      expect(broadcastEventType.safeParse(eventType).success).toBe(true)
    }
    expect(broadcastEventType.safeParse("contactInfo:other").success).toBe(
      false,
    )
  })

  test("only capture events are routed to the capture table", () => {
    expect(isContactInfoCaptureEvent("contactInfo:phoneCaptured")).toBe(true)
    expect(isContactInfoCaptureEvent("contactInfo:emailCaptured")).toBe(true)
    expect(isContactInfoCaptureEvent("message:sent")).toBe(false)
    expect(isContactInfoCaptureEvent("flow:ref")).toBe(false)
  })

  test("the stats response requires the two new counts", () => {
    const base = {
      "message:sent": 1,
      "message:delivered": 1,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    }
    expect(getBroadcastStatsResponse.safeParse(base).success).toBe(false)
    expect(
      getBroadcastStatsResponse.safeParse({
        ...base,
        "contactInfo:phoneCaptured": 2,
        "contactInfo:emailCaptured": 0,
      }).success,
    ).toBe(true)
  })
})
