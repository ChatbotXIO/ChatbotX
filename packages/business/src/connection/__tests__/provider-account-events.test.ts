import { describe, expect, test } from "vitest"
import {
  decideProviderEventOrder,
  resolveConnectionSendDecision,
} from "../provider-account-events"

const at = (seconds: number) => new Date(seconds * 1000)

describe("decideProviderEventOrder", () => {
  test("applies the first event for a row", () => {
    expect(
      decideProviderEventOrder(
        { at: null, kind: null },
        { at: at(10), kind: "offboarded" },
      ),
    ).toBe("apply")
  })

  test("applies a newer event and drops an older one", () => {
    const stored = { at: at(10), kind: "offboarded" } as const

    expect(
      decideProviderEventOrder(stored, { at: at(11), kind: "reconnected" }),
    ).toBe("apply")
    expect(
      decideProviderEventOrder(stored, { at: at(9), kind: "reconnected" }),
    ).toBe("stale")
  })

  test("treats an exact repeat as a duplicate", () => {
    expect(
      decideProviderEventOrder(
        { at: at(10), kind: "revoked" },
        { at: at(10), kind: "revoked" },
      ),
    ).toBe("duplicate")
  })

  test("breaks a same-timestamp tie by lifecycle order: revoked > reconnected > offboarded", () => {
    const order = (
      stored: "revoked" | "offboarded" | "reconnected",
      incoming: "revoked" | "offboarded" | "reconnected",
    ) =>
      decideProviderEventOrder(
        { at: at(10), kind: stored },
        { at: at(10), kind: incoming },
      )

    expect(order("offboarded", "reconnected")).toBe("apply")
    expect(order("reconnected", "offboarded")).toBe("stale")
    expect(order("offboarded", "revoked")).toBe("apply")
    expect(order("reconnected", "revoked")).toBe("apply")
    expect(order("revoked", "reconnected")).toBe("stale")
    expect(order("revoked", "offboarded")).toBe("stale")
  })
})

describe("resolveConnectionSendDecision", () => {
  test("defers only while the provider is re-onboarding the account", () => {
    expect(
      resolveConnectionSendDecision({
        status: "degraded",
        statusReason: "provider_offboarded",
      }),
    ).toBe("defer")
  })

  test.each([
    [{ status: "connected", statusReason: null }],
    [{ status: "degraded", statusReason: "refresh_failed" }],
    [{ status: "needs_reauth", statusReason: "provider_revoked" }],
    [{ status: "paused", statusReason: "trial_expired" }],
    [{ status: "disconnected", statusReason: "manual" }],
    [null],
  ] as const)("sends as before for %j", (connection) => {
    expect(resolveConnectionSendDecision(connection)).toBe("send")
  })
})
