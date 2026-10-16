import { describe, expect, test } from "vitest"
import { getCapiStatus } from "@/features/meta-conversions/lib/capi-status"

describe("getCapiStatus", () => {
  test("a connected integration is ready", () => {
    expect(getCapiStatus({ connection: "connected" })).toBe("ready")
  })

  test("a lapsed legacy setup reads as reconnect, never as a permission state", () => {
    expect(getCapiStatus({ connection: "reconnect" })).toBe("reconnect")
  })

  test("a never-connected integration reads as not connected", () => {
    expect(getCapiStatus({ connection: "notConnected" })).toBe("notConnected")
  })

  test("an unsupported channel overrides the connection", () => {
    expect(getCapiStatus({ connection: "connected", supported: false })).toBe(
      "unsupported",
    )
    expect(
      getCapiStatus({ connection: "notConnected", supported: false }),
    ).toBe("unsupported")
  })

  test("a supported channel follows its connection", () => {
    expect(getCapiStatus({ connection: "connected", supported: true })).toBe(
      "ready",
    )
  })
})
