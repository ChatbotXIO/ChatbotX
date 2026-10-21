import { describe, expect, test } from "vitest"
import { retryWarningMessage } from "@/features/facebook-marketing-messages/lib/campaign-status"

// F6: a retryable Meta problem is written to statusErrorMessage without a
// status change; the detail view shows it as a "retrying" warning.
describe("retryWarningMessage", () => {
  test.each([
    "scheduled",
    "sending",
    "waitingNextDay",
  ] as const)("shows the Meta message on an active (%s) campaign", (status) => {
    expect(
      retryWarningMessage({
        status,
        statusReason: null,
        statusErrorMessage: "Rate limited",
      }),
    ).toBe("Rate limited")
  })

  test("nothing when there is no message", () => {
    expect(
      retryWarningMessage({
        status: "sending",
        statusReason: null,
        statusErrorMessage: null,
      }),
    ).toBeNull()
  })

  test.each([
    "paused",
    "failed",
    "completed",
  ] as const)("nothing on a %s campaign (its reason alert carries the error)", (status) => {
    expect(
      retryWarningMessage({
        status,
        statusReason: "metaBlocker",
        statusErrorMessage: "x",
      }),
    ).toBeNull()
  })
})
