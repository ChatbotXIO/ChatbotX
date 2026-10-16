import { describe, expect, test } from "vitest"
import { contactsByDimensionQuerySchema } from "../src/schemas"

const range = {
  workspaceId: "1",
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-07T23:59:59.999Z",
}

describe("contactsByDimensionQuerySchema", () => {
  test("defaults the metric to new so existing callers keep their behaviour", () => {
    const parsed = contactsByDimensionQuerySchema.parse({
      ...range,
      dimension: "channel",
    })

    expect(parsed.metric).toBe("new")
  })

  test.each(["channel", "source"])("accepts total for %s", (dimension) => {
    const result = contactsByDimensionQuerySchema.safeParse({
      ...range,
      dimension,
      metric: "total",
    })

    expect(result.success).toBe(true)
  })

  test("rejects total for country because deleted events carry no country", () => {
    const result = contactsByDimensionQuerySchema.safeParse({
      ...range,
      dimension: "country",
      metric: "total",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["metric"])
  })

  test("still accepts new for country", () => {
    const result = contactsByDimensionQuerySchema.safeParse({
      ...range,
      dimension: "country",
      metric: "new",
    })

    expect(result.success).toBe(true)
  })

  test("rejects an unknown metric or dimension", () => {
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...range,
        dimension: "channel",
        metric: "all",
      }).success,
    ).toBe(false)
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...range,
        dimension: "device",
      }).success,
    ).toBe(false)
  })
})
