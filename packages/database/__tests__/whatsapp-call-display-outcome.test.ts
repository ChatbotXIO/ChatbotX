import { describe, expect, test } from "vitest"
import { resolveDisplayCallOutcome } from "../src/partials/whatsapp-call"

describe("resolveDisplayCallOutcome — coalesce(outcome, status) reader contract", () => {
  test("returns the persisted outcome when present", () => {
    expect(
      resolveDisplayCallOutcome({ status: "failed", outcome: "canceled" }),
    ).toBe("canceled")
  })

  test("falls back to status for a legacy terminal row with null outcome", () => {
    expect(
      resolveDisplayCallOutcome({ status: "completed", outcome: null }),
    ).toBe("completed")
    expect(
      resolveDisplayCallOutcome({ status: "rejected", outcome: null }),
    ).toBe("rejected")
    expect(resolveDisplayCallOutcome({ status: "failed", outcome: null })).toBe(
      "failed",
    )
  })

  test("never fabricates 'canceled' from status alone (no status equivalent exists)", () => {
    // A failed row with no outcome can never resolve to "canceled" —
    // only an explicit outcome write can mark a call canceled.
    expect(resolveDisplayCallOutcome({ status: "failed", outcome: null })).toBe(
      "failed",
    )
  })

  test("returns null for a non-terminal row with no outcome", () => {
    expect(
      resolveDisplayCallOutcome({ status: "ringing", outcome: null }),
    ).toBeNull()
    expect(
      resolveDisplayCallOutcome({ status: "accepted", outcome: null }),
    ).toBeNull()
  })
})
