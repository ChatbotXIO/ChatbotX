import { describe, expect, test } from "vitest"
import { ctwaRetargetConditionSchema } from "../ctwa-retarget-filter"

describe("ctwaRetargetConditionSchema", () => {
  test.each([
    "conversations",
    "leads",
    "purchases",
  ] as const)("accepts a valid %s condition with an adId", (segment) => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment,
      adId: "238512000000102",
      since: "2026-07-01",
      until: "2026-07-31",
    })

    expect(result.success).toBe(true)
  })

  test("accepts a condition without an adId (all ads)", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "purchases",
      since: "2026-07-01",
      until: "2026-07-31",
    })

    expect(result.success).toBe(true)
  })

  test("rejects an unknown segment", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "not-a-real-segment",
      since: "2026-07-01",
      until: "2026-07-31",
    })

    expect(result.success).toBe(false)
  })

  test("rejects a non-YYYY-MM-DD date", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "purchases",
      since: "2026-07-01T00:00:00Z",
      until: "2026-07-31",
    })

    expect(result.success).toBe(false)
  })

  test("rejects since after until", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "purchases",
      since: "2026-07-31",
      until: "2026-07-01",
    })

    expect(result.success).toBe(false)
  })

  test("rejects a date range beyond the ads analytics cap (366 days)", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "purchases",
      since: "2024-01-01",
      until: "2026-01-01",
    })

    expect(result.success).toBe(false)
  })

  test("accepts a date range at the cap boundary (~366 days)", () => {
    const result = ctwaRetargetConditionSchema.safeParse({
      field: "ctwaRetarget",
      segment: "purchases",
      since: "2025-01-01",
      until: "2026-01-01",
    })

    expect(result.success).toBe(true)
  })
})
