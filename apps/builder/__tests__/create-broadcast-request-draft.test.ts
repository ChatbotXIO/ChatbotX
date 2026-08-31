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

describe("createBroadcastRequest.saveAsDraft", () => {
  test("defaults to undefined and accepts true", () => {
    expect(createBroadcastRequest.parse(base).saveAsDraft).toBeUndefined()
    expect(
      createBroadcastRequest.parse({ ...base, saveAsDraft: true }).saveAsDraft,
    ).toBe(true)
  })

  test("rejects non-boolean values", () => {
    expect(
      createBroadcastRequest.safeParse({ ...base, saveAsDraft: "yes" }).success,
    ).toBe(false)
  })
})

describe("createBroadcastRequest.schedulesAt", () => {
  test("rejects a future time whose minute-start is not after now", () => {
    // 20s into the *current* minute rounds down (startOfMinute) to a value
    // that is what actually gets persisted — so it must fail validation
    // too. Anchored to the current minute boundary (rather than
    // `Date.now() + 20_000`) so the assertion is not flaky when the test
    // happens to run in the last 20s of a minute.
    const startOfCurrentMinuteMs = Math.floor(Date.now() / 60_000) * 60_000
    const schedulesAt = new Date(startOfCurrentMinuteMs + 20_000).toISOString()
    const result = createBroadcastRequest.safeParse({
      ...base,
      schedulesType: "future",
      schedulesAt,
    })
    expect(result.success).toBe(false)
  })

  test("accepts a time at least 1 minute ahead", () => {
    const schedulesAt = new Date(Date.now() + 90_000).toISOString()
    const result = createBroadcastRequest.safeParse({
      ...base,
      schedulesType: "future",
      schedulesAt,
    })
    expect(result.success).toBe(true)
  })
})
