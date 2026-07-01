// @vitest-environment node
import { describe, expect, test } from "vitest"
import { getLatestContactLastReadAt } from "@/features/contacts/utils"

describe("getLatestContactLastReadAt", () => {
  test("returns the latest contact inbox read timestamp", () => {
    const oldest = new Date("2026-01-01T00:00:00.000Z")
    const latest = new Date("2026-01-03T00:00:00.000Z")

    expect(
      getLatestContactLastReadAt([
        { contactLastReadAt: oldest },
        { contactLastReadAt: null },
        { contactLastReadAt: latest },
      ]),
    ).toBe(latest)
  })

  test("returns null when no contact inbox read timestamp exists", () => {
    expect(
      getLatestContactLastReadAt([
        { contactLastReadAt: null },
        { contactLastReadAt: undefined },
      ]),
    ).toBeNull()
  })
})
