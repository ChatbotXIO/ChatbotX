// @vitest-environment node
import { describe, expect, test } from "vitest"
import { bulkTagStatsContactsRequest } from "@/features/contacts/schemas/contact-tag"

describe("bulkTagStatsContactsRequest schema", () => {
  test("accepts broadcast stats contacts with default exclusions", () => {
    const parsed = bulkTagStatsContactsRequest.parse({
      source: "broadcast",
      broadcastId: "123",
      eventType: "message:sent",
      tags: ["VIP"],
    })

    expect(parsed).toMatchObject({
      source: "broadcast",
      excludedContactIds: [],
    })
  })

  test("accepts sequence step stats contacts with exclusions", () => {
    const result = bulkTagStatsContactsRequest.safeParse({
      source: "sequenceStep",
      sequenceId: "123",
      stepId: "456",
      eventType: "message:failed",
      excludedContactIds: ["789"],
      tags: ["Needs review"],
    })

    expect(result.success).toBe(true)
  })

  test("rejects sequence step requests without stepId", () => {
    const result = bulkTagStatsContactsRequest.safeParse({
      source: "sequenceStep",
      sequenceId: "123",
      eventType: "message:sent",
      tags: ["VIP"],
    })

    expect(result.success).toBe(false)
  })

  test("rejects empty tags", () => {
    const result = bulkTagStatsContactsRequest.safeParse({
      source: "broadcast",
      broadcastId: "123",
      eventType: "message:sent",
      tags: [],
    })

    expect(result.success).toBe(false)
  })

  test("rejects non-numeric excluded contact ids", () => {
    const result = bulkTagStatsContactsRequest.safeParse({
      source: "broadcast",
      broadcastId: "123",
      eventType: "message:sent",
      excludedContactIds: ["not-a-number"],
      tags: ["VIP"],
    })

    expect(result.success).toBe(false)
  })
})
