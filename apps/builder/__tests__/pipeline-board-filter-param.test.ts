import { describe, expect, test } from "vitest"
import { parseBoardFilter } from "../src/features/pipelines/lib/search-params"

describe("parseBoardFilter (board filter from the URL)", () => {
  test("round-trips a filter through JSON, with dates back as Date", () => {
    const filter = {
      statuses: ["won"],
      priorities: ["high"],
      value: { min: 10 },
      createdAt: { from: new Date("2026-10-01T00:00:00.000Z") },
      fieldConditions: { "12": { operator: "is", value: "vip" } },
    }

    const parsed = parseBoardFilter(JSON.parse(JSON.stringify(filter)))

    expect(parsed).toEqual(filter)
    expect(parsed?.createdAt?.from).toBeInstanceOf(Date)
  })

  test("a hand-edited link the API would reject is dropped whole", () => {
    expect(parseBoardFilter({ statuses: ["archived"] })).toBeNull()
    expect(
      parseBoardFilter({
        fieldConditions: { "not-an-id": { operator: "is", value: "x" } },
      }),
    ).toBeNull()
    expect(
      parseBoardFilter({ createdAt: { from: "1800-01-01T00:00:00Z" } }),
    ).toBeNull()
    expect(parseBoardFilter("not an object")).toBeNull()
  })

  test("keeps the operator forms and relative presets, so reopened links stay relative", () => {
    const filter = {
      value: { operator: "between", min: 1, max: 9 },
      presets: { dueDate: "next7" },
      fieldConditions: {
        "12": { operator: "contains", value: "vip" },
        "13": { operator: "noValue" },
        "14": {
          operator: "between",
          value: "2026-01-01",
          valueTo: "2026-02-01",
        },
      },
      timezone: "Asia/Ho_Chi_Minh",
    }

    expect(parseBoardFilter(JSON.parse(JSON.stringify(filter)))).toEqual(filter)
  })

  test("drops a link with an unknown preset, preset row or operator", () => {
    expect(parseBoardFilter({ presets: { dueDate: "someday" } })).toBeNull()
    expect(parseBoardFilter({ presets: { nonsense: "today" } })).toBeNull()
    expect(
      parseBoardFilter({ fieldConditions: { "1": { operator: "regex" } } }),
    ).toBeNull()
    expect(parseBoardFilter({ presets: { "field-4": "today" } })).toBeNull()
    expect(parseBoardFilter({ timezone: "Mars/Olympus" })).toBeNull()
    expect(parseBoardFilter({ value: { operator: "gte" } })).toBeNull()
  })

  test("round-trips the activity condition and its when preset", () => {
    const filter = {
      activityMatch: {
        kinds: ["stageChanged"],
        actorUserIds: ["5"],
        automation: true,
      },
      presets: { activityWhen: "last30" },
    }

    expect(parseBoardFilter(JSON.parse(JSON.stringify(filter)))).toEqual(filter)
    expect(
      parseBoardFilter({ activityMatch: { kinds: ["nonsense"] } }),
    ).toBeNull()
  })
})
