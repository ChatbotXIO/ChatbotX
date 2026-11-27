import { describe, expect, test } from "vitest"
import { applicableFilter } from "../src/features/pipelines/components/board/filter-helpers"

const none = new Set<string>()

describe("applicableFilter", () => {
  test("keeps conditions the pipeline can still apply", () => {
    expect(
      applicableFilter(
        {
          statuses: ["won"],
          value: { min: 10 },
          fieldConditions: { "1": { operator: "is", value: "vip" } },
        },
        { hiddenFeatures: none, fieldIds: new Set(["1"]) },
      ),
    ).toEqual({
      statuses: ["won"],
      value: { min: 10 },
      fieldConditions: { "1": { operator: "is", value: "vip" } },
    })
  })

  test("drops filters on hidden features, which have no row in the sheet", () => {
    const due = { from: new Date("2026-01-01T00:00:00Z") }
    expect(
      applicableFilter(
        {
          statuses: ["open"],
          value: { max: 5 },
          priorities: ["high"],
          dueDate: due,
        },
        {
          hiddenFeatures: new Set(["value", "priority", "dueDate"]),
          fieldIds: none,
        },
      ),
    ).toEqual({ statuses: ["open"] })
  })

  test("drops deleted custom fields, so a refetch is not rejected", () => {
    const day = { operator: "gt", value: "2026-02-01" } as const
    expect(
      applicableFilter(
        {
          fieldConditions: {
            "1": { operator: "is", value: "a" },
            "2": { operator: "is", value: "b" },
            "3": day,
            "4": day,
          },
        },
        { hiddenFeatures: none, fieldIds: new Set(["1", "4"]) },
      ),
    ).toEqual({
      fieldConditions: { "1": { operator: "is", value: "a" }, "4": day },
    })
  })

  test("a filter left with nothing applicable is empty", () => {
    expect(
      applicableFilter(
        { fieldConditions: { "9": { operator: "lt", value: "2026-03-01" } } },
        { hiddenFeatures: none, fieldIds: none },
      ),
    ).toEqual({})
  })
})
