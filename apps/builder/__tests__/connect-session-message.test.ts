import { describe, expect, test } from "vitest"
import { resolveConnectSessionMessageKind } from "@/app/connect/[sessionId]/resolve-message"

describe("resolveConnectSessionMessageKind", () => {
  test("returns invalid when the session id resolved to nothing", () => {
    expect(resolveConnectSessionMessageKind(null)).toBe("invalid")
  })

  test.each([
    "pending",
    "authorized",
    "awaiting_selection",
  ] as const)("treats %s as still-processing (auto-refreshing), not failed", (status) => {
    expect(resolveConnectSessionMessageKind(status)).toBe("processing")
  })

  test("returns completed for a completed session", () => {
    expect(resolveConnectSessionMessageKind("completed")).toBe("completed")
  })

  test("returns cancelled for a cancelled session", () => {
    expect(resolveConnectSessionMessageKind("cancelled")).toBe("cancelled")
  })

  test("returns expired for an expired session", () => {
    expect(resolveConnectSessionMessageKind("expired")).toBe("expired")
  })

  test("returns failed for a failed session", () => {
    expect(resolveConnectSessionMessageKind("failed")).toBe("failed")
  })

  test("falls back to failed for an unrecognized future status rather than misreporting progress", () => {
    expect(
      resolveConnectSessionMessageKind(
        "some_future_status" as unknown as "failed",
      ),
    ).toBe("failed")
  })
})
