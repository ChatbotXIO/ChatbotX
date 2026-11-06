import { describe, expect, test } from "vitest"
import { getPollState } from "../src/poll/state"

const poll = {
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2026-01-02T00:00:00.000Z"),
}

describe("getPollState", () => {
  test("now === startsAt is running", () => {
    expect(getPollState(poll, poll.startsAt)).toBe("running")
  })
  test("now === endsAt is ended (exclusive)", () => {
    expect(getPollState(poll, poll.endsAt)).toBe("ended")
  })
  test("before startsAt is notStarted", () => {
    expect(getPollState(poll, new Date("2025-12-31T23:59:59.999Z"))).toBe(
      "notStarted",
    )
  })
})
