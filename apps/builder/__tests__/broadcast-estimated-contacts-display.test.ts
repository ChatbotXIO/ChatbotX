import { describe, expect, test } from "vitest"
import { getEstimatedContactsDisplayState } from "../src/features/broadcasts/utils/estimated-contacts-display"

describe("getEstimatedContactsDisplayState", () => {
  test("shows a count when contactCount is available", () => {
    expect(
      getEstimatedContactsDisplayState({
        contactCount: 12,
        status: "cancelled",
      }),
    ).toBe("count")
  })

  test("keeps loading for active broadcasts without contactCount", () => {
    expect(
      getEstimatedContactsDisplayState({
        contactCount: null,
        status: "scheduled",
      }),
    ).toBe("loading")
    expect(
      getEstimatedContactsDisplayState({
        contactCount: null,
        status: "sending",
      }),
    ).toBe("loading")
  })

  test("does not keep terminal broadcasts loading without contactCount", () => {
    expect(
      getEstimatedContactsDisplayState({
        contactCount: null,
        status: "cancelled",
      }),
    ).toBe("empty")
    expect(
      getEstimatedContactsDisplayState({
        contactCount: null,
        status: "sent",
      }),
    ).toBe("empty")
  })
})
