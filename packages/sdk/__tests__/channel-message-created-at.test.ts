import { describe, expect, test } from "vitest"
import { resolveChannelMessageCreatedAt } from "../src"

describe("resolveChannelMessageCreatedAt", () => {
  const now = new Date("2026-09-25T00:00:00.000Z")

  test("keeps a channel timestamp inside the accepted window", () => {
    expect(resolveChannelMessageCreatedAt(now.getTime() - 60_000, now)).toEqual(
      new Date("2026-09-24T23:59:00.000Z"),
    )
  })

  test("returns null when the timestamp is older than seven days", () => {
    expect(
      resolveChannelMessageCreatedAt(
        now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1,
        now,
      ),
    ).toBeNull()
  })

  test("returns null when the timestamp is more than five minutes ahead", () => {
    expect(
      resolveChannelMessageCreatedAt(now.getTime() + 5 * 60 * 1000 + 1, now),
    ).toBeNull()
  })
})
