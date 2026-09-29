import { describe, expect, test } from "vitest"
import { BLOCKED_OUTBOUND_COUNTRIES } from "../src/features/integration-whatsapp/calling/actions/blocked-outbound-countries"

describe("BLOCKED_OUTBOUND_COUNTRIES", () => {
  test("matches Meta's business-initiated calling block list exactly", () => {
    expect([...BLOCKED_OUTBOUND_COUNTRIES].sort()).toEqual(
      ["CA", "EG", "NG", "US", "VN"].sort(),
    )
  })

  test("does not include Turkey (TR)", () => {
    expect(BLOCKED_OUTBOUND_COUNTRIES.has("TR")).toBe(false)
  })
})
