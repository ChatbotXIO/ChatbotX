import { describe, expect, test } from "vitest"
import { parseShareExpiry } from "../src/features/templates/lib/share-expiry"

describe("parseShareExpiry", () => {
  test("an absent expiry stays absent so the current one is kept", () => {
    expect(parseShareExpiry(undefined)).toBeUndefined()
  })

  test("null removes the expiry", () => {
    expect(parseShareExpiry(null)).toBeNull()
  })

  test("an ISO date-time becomes a Date", () => {
    expect(parseShareExpiry("2026-12-31T10:00:00.000Z")).toEqual(
      new Date("2026-12-31T10:00:00.000Z"),
    )
  })
})
