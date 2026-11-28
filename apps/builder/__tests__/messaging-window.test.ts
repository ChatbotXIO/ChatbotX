import { describe, expect, test } from "vitest"
import { formatCountdown } from "@/features/messages/lib/messaging-window"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// The window policy and state resolver are covered in
// packages/sdk/__tests__/messaging-window.test.ts: the composer and the
// contact panel row both run the SDK's `resolveMessagingWindow`.
describe("formatCountdown", () => {
  test("formats hh:mm:ss and clamps negatives", () => {
    expect(formatCountdown(0)).toBe("00:00:00")
    expect(formatCountdown(999)).toBe("00:00:00")
    expect(formatCountdown(DAY_MS)).toBe("24:00:00")
    expect(formatCountdown(3 * HOUR_MS + 4 * 60_000 + 5000)).toBe("03:04:05")
    expect(formatCountdown(-5000)).toBe("00:00:00")
  })
})
