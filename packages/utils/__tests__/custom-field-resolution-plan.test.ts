import { describe, expect, test } from "vitest"
import {
  pickCustomFieldRow,
  planCustomFieldResolution,
} from "../src/custom-field"

const row = (id: string, name: string, type: "shortText" | "number") => ({
  id,
  name,
  type,
})

describe("pickCustomFieldRow", () => {
  test("an exact trimmed-name match beats a case-only match, then the lowest id wins", () => {
    expect(
      pickCustomFieldRow(
        row("5", "Age", "number"),
        row("9", "age", "number"),
        "age",
      ).id,
    ).toBe("9")
    expect(
      pickCustomFieldRow(
        row("9", "Age", "number"),
        row("3", "AGE", "number"),
        "age",
      ).id,
    ).toBe("3")
    expect(
      pickCustomFieldRow(undefined, row("9", "Age", "number"), "age").id,
    ).toBe("9")
  })
})

describe("planCustomFieldResolution", () => {
  test("reuses a field of the same type whatever its casing, picking the install's winner", () => {
    const { plans } = planCustomFieldResolution(
      [row("9", "Age", "number"), row("5", "age", "number")],
      [{ name: "age", type: "number" }],
    )
    expect(plans.get("number:age")).toMatchObject({
      action: "reuse",
      row: { id: "5" },
    })
  })

  test("a name used by another type is renamed, an unused one is created as written", () => {
    const { plans } = planCustomFieldResolution(
      [row("1", "Age", "number")],
      [
        { name: "age", type: "shortText" },
        { name: "City", type: "shortText" },
      ],
    )
    expect(plans.get("shortText:age")).toEqual({
      action: "rename",
      plannedName: "age_1",
    })
    expect(plans.get("shortText:city")).toEqual({
      action: "create",
      plannedName: "City",
    })
  })

  test("two requested fields sharing a name across types: the second is renamed", () => {
    const { plans } = planCustomFieldResolution(
      [],
      [
        { name: "age", type: "shortText" },
        { name: "Age", type: "number" },
      ],
    )
    expect(plans.get("shortText:age")).toMatchObject({ action: "create" })
    expect(plans.get("number:age")).toEqual({
      action: "rename",
      plannedName: "Age_1",
    })
  })

  test("requested fields that fold to one key are a single request (the last stands)", () => {
    const { requests, plans } = planCustomFieldResolution(
      [],
      [
        { name: "age", type: "shortText" },
        { name: "AGE ", type: "shortText" },
      ],
    )
    expect(requests).toEqual([{ name: "AGE ", type: "shortText" }])
    expect(plans.size).toBe(1)
  })

  test("a rename skips a numbered name that already exists", () => {
    const { plans } = planCustomFieldResolution(
      [row("1", "Age", "number"), row("2", "age_1", "shortText")],
      [{ name: "age", type: "shortText" }],
    )
    expect(plans.get("shortText:age")).toEqual({
      action: "rename",
      plannedName: "age_2",
    })
  })

  test("a rename never collides with a name planned earlier in the same request", () => {
    const { plans } = planCustomFieldResolution(
      [row("1", "Age", "number")],
      [
        { name: "age", type: "shortText" },
        { name: "age_1", type: "number" },
      ],
    )
    expect(plans.get("shortText:age")).toEqual({
      action: "rename",
      plannedName: "age_1",
    })
    // "age_1" was just taken by the first rename, so the second must move on.
    expect(plans.get("number:age_1")).toEqual({
      action: "rename",
      plannedName: "age_1_1",
    })
  })
})
