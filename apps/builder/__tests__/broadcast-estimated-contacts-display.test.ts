import { describe, expect, test } from "vitest"
import {
  getEstimatedContactsDisplayState,
  isBroadcastInProgress,
} from "../src/features/broadcasts/utils/estimated-contacts-display"

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

  test("shows empty for draft and failed rows without contactCount", () => {
    expect(
      getEstimatedContactsDisplayState({ contactCount: null, status: "draft" }),
    ).toBe("empty")
    expect(
      getEstimatedContactsDisplayState({
        contactCount: null,
        status: "failed",
      }),
    ).toBe("empty")
  })
})

describe("isBroadcastInProgress", () => {
  test("is true only while the worker still owns the broadcast", () => {
    expect(isBroadcastInProgress("scheduled")).toBe(true)
    expect(isBroadcastInProgress("sending")).toBe(true)
    for (const status of ["draft", "sent", "failed", "cancelled"]) {
      expect(isBroadcastInProgress(status)).toBe(false)
    }
  })
})
