// @vitest-environment node
import { describe, expect, test } from "vitest"
import { saveAiHandoverSettingsRequest } from "../src/features/integration-ai-handover/schema/request"

const VALID = {
  enabled: true,
  scheduleEnabled: true,
  timeRanges: [{ from: 8, to: 17 }],
  gotoFlowId: null,
  returnMessage: "",
  pauseBotWaitingForStaff: false,
}

const parse = (overrides: Record<string, unknown> = {}) =>
  saveAiHandoverSettingsRequest.safeParse({ ...VALID, ...overrides })

describe("saveAiHandoverSettingsRequest", () => {
  test("accepts a complete valid payload", () => {
    expect(parse().success).toBe(true)
  })

  test("accepts a midnight-wrapping and an all-day range", () => {
    expect(
      parse({
        timeRanges: [
          { from: 22, to: 6 },
          { from: 0, to: 24 },
        ],
      }).success,
    ).toBe(true)
  })

  test("accepts no ranges when the schedule is off", () => {
    expect(parse({ scheduleEnabled: false, timeRanges: [] }).success).toBe(true)
  })

  test("rejects an enabled schedule with no range, on the timeRanges path", () => {
    const result = parse({ scheduleEnabled: true, timeRanges: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["timeRanges"])
  })

  test.each([
    ["equal bounds", { from: 9, to: 9 }],
    ["above 24", { from: 0, to: 25 }],
    ["negative", { from: -1, to: 5 }],
    ["fractional", { from: 8.5, to: 17 }],
  ])("rejects a range with %s", (_label, range) => {
    expect(parse({ timeRanges: [range] }).success).toBe(false)
  })

  test("rejects a return message over 2000 characters", () => {
    expect(parse({ returnMessage: "x".repeat(2001) }).success).toBe(false)
    expect(parse({ returnMessage: "x".repeat(2000) }).success).toBe(true)
  })

  test("accepts a flow id string or null, rejects a non-id", () => {
    expect(parse({ gotoFlowId: "123456789" }).success).toBe(true)
    expect(parse({ gotoFlowId: null }).success).toBe(true)
    expect(parse({ gotoFlowId: "not-an-id" }).success).toBe(false)
  })
})
