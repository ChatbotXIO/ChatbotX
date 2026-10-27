import { describe, expect, test } from "vitest"
import { resolveDatePreset } from "../../../lib/date-presets"
import {
  applicableFilter,
  applyDateChoice,
  cleanFilter,
  countActiveFilters,
  dateChoiceOf,
  filterRowCounts,
  openFilterRowIds,
  readFieldCondition,
  selectedActivityGroups,
  toggleActivityGroup,
  toRequestFilter,
  writeFieldCondition,
} from "../filter-helpers"
import type { BoardFilterInput } from "../types"

describe("openFilterRowIds", () => {
  test("an empty filter opens nothing", () => {
    expect(openFilterRowIds({})).toEqual([])
  })

  test("every row holding a saved value opens, custom fields included", () => {
    expect(
      openFilterRowIds({
        statuses: ["open"],
        assigneeTeamIds: ["7"],
        value: { min: 0 },
        createdAt: { from: new Date("2026-01-01T00:00:00Z") },
        closedAs: { won: { to: new Date("2026-02-01T00:00:00Z") } },
        fieldConditions: {
          "11": { operator: "is", value: "gold" },
          "12": { operator: "contains", value: "" },
          "13": { operator: "gt", value: "2026-03-01" },
        },
      }).sort(),
    ).toEqual(
      [
        "assignees",
        "closedAs-won",
        "createdAt",
        "field-11",
        "field-13",
        "status",
        "value",
      ].sort(),
    )
  })
})

describe("value condition", () => {
  test("counts a single-amount operator only once it has an amount", () => {
    expect(filterRowCounts({ value: { operator: "gt" } }).value).toBe(0)
    expect(
      filterRowCounts({ value: { operator: "gt", amount: 5 } }).value,
    ).toBe(1)
  })

  test("counts the legacy interval and an operator interval", () => {
    expect(filterRowCounts({ value: { min: 1 } }).value).toBe(1)
    expect(
      filterRowCounts({ value: { operator: "between", max: 9 } }).value,
    ).toBe(1)
  })

  test("clean keeps only the fields of the chosen operator", () => {
    expect(
      cleanFilter({ value: { operator: "eq", amount: 3, min: 1, max: 2 } }),
    ).toEqual({ value: { operator: "eq", amount: 3 } })
    expect(cleanFilter({ value: { operator: "ne" } })).toEqual({})
  })
})

describe("date presets", () => {
  const NOW = new Date(2026, 2, 18, 12, 0, 0)

  test("a preset counts as one condition and opens its row", () => {
    const filter: BoardFilterInput = {
      presets: { dueDate: "next7" },
    }

    expect(filterRowCounts(filter).dueDate).toBe(1)
    expect(openFilterRowIds(filter).sort()).toEqual(["dueDate"])
  })

  test("an empty custom choice is no filter", () => {
    expect(cleanFilter({ presets: { createdAt: "custom" } })).toEqual({})
    expect(countActiveFilters({ presets: { createdAt: "custom" } })).toBe(0)
  })

  test("a custom range outlives the dropped custom marker", () => {
    const range = { from: new Date(2026, 0, 1) }

    expect(
      cleanFilter({ presets: { createdAt: "custom" }, createdAt: range }),
    ).toEqual({ createdAt: range })
  })

  test("a preset supersedes a stale range on the same row", () => {
    expect(
      cleanFilter({
        presets: { updatedAt: "today" },
        updatedAt: { from: new Date(2020, 0, 1) },
      }),
    ).toEqual({ presets: { updatedAt: "today" } })
  })

  test("request resolution turns presets into ranges and drops the keys", () => {
    const request = toRequestFilter(
      {
        statuses: ["open"],
        presets: {
          dueDate: "tomorrow",
          "closedAs-won": "today",
        },
        fieldConditions: { "9": { operator: "gt", value: "2026-03-01" } },
      },
      NOW,
    )

    expect(request).toEqual({
      statuses: ["open"],
      dueDate: resolveDatePreset("tomorrow", NOW),
      closedAs: { won: resolveDatePreset("today", NOW) },
      fieldConditions: { "9": { operator: "gt", value: "2026-03-01" } },
    })
    expect(request).not.toHaveProperty("presets")
  })

  test("the same saved preset resolves differently on a later day", () => {
    const saved: BoardFilterInput = { presets: { createdAt: "last7" } }
    const later = new Date(2026, 2, 25, 12, 0, 0)

    expect(toRequestFilter(saved, later).createdAt).not.toEqual(
      toRequestFilter(saved, NOW).createdAt,
    )
  })

  test("choosing a row's option keeps preset, range and presence consistent", () => {
    const withRange: BoardFilterInput = {
      createdAt: { from: new Date(2026, 0, 1) },
    }

    expect(dateChoiceOf(withRange, "createdAt")).toBe("custom")
    expect(
      dateChoiceOf(
        applyDateChoice(withRange, "createdAt", "today"),
        "createdAt",
      ),
    ).toBe("today")
    expect(
      cleanFilter(applyDateChoice(withRange, "createdAt", "today")),
    ).toEqual({ presets: { createdAt: "today" } })
    expect(cleanFilter(applyDateChoice(withRange, "createdAt", "all"))).toEqual(
      {},
    )
  })

  test("request resolution adds the viewer's timezone only with field conditions", () => {
    expect(
      toRequestFilter({ statuses: ["open"] }, NOW, "Asia/Tokyo"),
    ).not.toHaveProperty("timezone")
    expect(
      toRequestFilter(
        { fieldConditions: { "1": { operator: "hasValue" } } },
        NOW,
        "Asia/Tokyo",
      ).timezone,
    ).toBe("Asia/Tokyo")
  })
})

describe("field conditions", () => {
  test("a valueless operator counts without a value, others need one", () => {
    expect(
      filterRowCounts({ fieldConditions: { "1": { operator: "noValue" } } })[
        "field-1"
      ],
    ).toBe(1)
    expect(
      filterRowCounts({
        fieldConditions: { "1": { operator: "contains", value: "" } },
      })["field-1"],
    ).toBe(0)
    expect(
      cleanFilter({
        fieldConditions: {
          "1": { operator: "contains" },
          "2": { operator: "gt", value: "0" },
        },
      }),
    ).toEqual({ fieldConditions: { "2": { operator: "gt", value: "0" } } })
  })

  test("an interval counts with either bound and keeps only the bounds it has", () => {
    expect(
      filterRowCounts({
        fieldConditions: { "1": { operator: "between", valueTo: "9" } },
      })["field-1"],
    ).toBe(1)
    expect(
      filterRowCounts({
        fieldConditions: { "1": { operator: "between", value: "" } },
      })["field-1"],
    ).toBe(0)
    expect(
      cleanFilter({
        fieldConditions: {
          "1": { operator: "between", value: "1", valueTo: "" },
        },
      }),
    ).toEqual({ fieldConditions: { "1": { operator: "between", value: "1" } } })
  })

  test("cleaning drops operands the operator does not use", () => {
    expect(
      cleanFilter({
        fieldConditions: {
          "1": { operator: "hasValue", value: "x", valueTo: "y" },
          "2": { operator: "is", value: "a", valueTo: "b" },
        },
      }),
    ).toEqual({
      fieldConditions: {
        "1": { operator: "hasValue" },
        "2": { operator: "is", value: "a" },
      },
    })
  })

  test("writing a condition replaces the previous one and removing clears it", () => {
    const written = writeFieldCondition({}, "7", {
      operator: "startsWith",
      value: "g",
    })

    expect(readFieldCondition(written, "7")).toEqual({
      operator: "startsWith",
      value: "g",
    })
    expect(
      readFieldCondition(writeFieldCondition(written, "7", undefined), "7"),
    ).toBeUndefined()
  })

  test("applicableFilter drops conditions of deleted fields and presets of hidden due dates", () => {
    expect(
      applicableFilter(
        {
          fieldConditions: {
            "1": { operator: "noValue" },
            "2": { operator: "noValue" },
          },
          presets: { dueDate: "today" },
        },
        { hiddenFeatures: new Set(["dueDate"]), fieldIds: new Set(["1"]) },
      ),
    ).toEqual({ fieldConditions: { "1": { operator: "noValue" } } })
  })
})

describe("activity condition", () => {
  const activityFilter: BoardFilterInput = {
    activityMatch: {
      kinds: ["stageChanged", "commentAdded", "commentDeleted"],
      actorUserIds: ["5", "6"],
      automation: true,
      occurredAt: { from: new Date("2026-01-01T00:00:00Z") },
    },
  }

  test("counts selected groups, actors (automation included) and the date", () => {
    const counts = filterRowCounts(activityFilter)

    expect(counts.activityKinds).toBe(2)
    expect(counts.activityActors).toBe(3)
    expect(counts.activityWhen).toBe(1)
    expect(countActiveFilters(activityFilter)).toBe(6)
    expect(countActiveFilters({})).toBe(0)
  })

  test("a partially selected group is not counted", () => {
    expect(selectedActivityGroups(["commentAdded"]).includes("comments")).toBe(
      false,
    )
  })

  test("toggling a group adds or removes all its kinds", () => {
    const added = toggleActivityGroup(["stageChanged"], "comments")

    expect(added).toEqual(["stageChanged", "commentAdded", "commentDeleted"])
    expect(toggleActivityGroup(added, "comments")).toEqual(["stageChanged"])
  })

  test("saved rows reopen expanded", () => {
    expect(openFilterRowIds(activityFilter).sort()).toEqual([
      "activityActors",
      "activityKinds",
      "activityWhen",
    ])
  })

  test("cleanFilter drops empty parts and an empty condition", () => {
    expect(
      cleanFilter({
        activityMatch: { kinds: [], actorUserIds: [], automation: false },
      }),
    ).toEqual({})
  })

  test("a relative preset on the when row resolves to a range in the request", () => {
    const now = new Date("2026-05-20T10:00:00Z")
    const request = toRequestFilter(
      cleanFilter({
        activityMatch: { automation: true },
        presets: { activityWhen: "last7" },
      }),
      now,
    )

    expect(request.activityMatch?.automation).toBe(true)
    expect(request.activityMatch?.occurredAt).toEqual(
      resolveDatePreset("last7", now),
    )
  })
})
