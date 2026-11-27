import { describe, expect, test } from "vitest"
import {
  explicitSelection,
  isItemLocked,
  summarizeSelection,
  withAllLocked,
  withAllSelected,
  withItemLocked,
} from "../src/features/templates/lib/selection"

describe("template selection locks", () => {
  test("an explicit selection carries only locks on selected ids", () => {
    expect(explicitSelection(["a", "b"], ["b", "z"])).toEqual({
      mode: "ids",
      ids: ["a", "b"],
      lockedIds: ["b"],
    })
  })

  test("a selection with no locks has no lockedIds key", () => {
    expect(explicitSelection(["a"], [])).toEqual({ mode: "ids", ids: ["a"] })
  })

  test("locks and unlocks one item of an ids selection", () => {
    const locked = withItemLocked(
      { mode: "ids", ids: ["a", "b"] },
      "a",
      true,
      [],
    )
    expect(locked).toEqual({ mode: "ids", ids: ["a", "b"], lockedIds: ["a"] })
    expect(isItemLocked(locked, "a")).toBe(true)
    expect(isItemLocked(locked, "b")).toBe(false)

    expect(withItemLocked(locked, "a", false, [])).toEqual({
      mode: "ids",
      ids: ["a", "b"],
    })
  })

  test("locking one item of an all selection downgrades it to an exact list", () => {
    expect(withItemLocked({ mode: "all" }, "b", true, ["a", "b", "c"])).toEqual(
      { mode: "ids", ids: ["a", "b", "c"], lockedIds: ["b"] },
    )
  })

  test("unlocking one item of an all-locked selection keeps the rest locked", () => {
    expect(
      withItemLocked({ mode: "all", lockAll: true }, "b", false, [
        "a",
        "b",
        "c",
      ]),
    ).toEqual({ mode: "ids", ids: ["a", "b", "c"], lockedIds: ["a", "c"] })
  })

  test("lock-all on an all selection stays a sentinel; on an ids selection it lists every id", () => {
    expect(withAllLocked({ mode: "all" }, true)).toEqual({
      mode: "all",
      lockAll: true,
    })
    expect(withAllLocked({ mode: "ids", ids: ["a", "b"] }, true)).toEqual({
      mode: "ids",
      ids: ["a", "b"],
      lockedIds: ["a", "b"],
    })
    expect(
      withAllLocked(
        { mode: "ids", ids: ["a", "b"], lockedIds: ["a", "b"] },
        false,
      ),
    ).toEqual({ mode: "ids", ids: ["a", "b"] })
  })

  describe("withAllSelected", () => {
    test("widens an explicit selection while keeping its View-only marks", () => {
      expect(
        withAllSelected({ mode: "ids", ids: ["a"], lockedIds: ["a"] }, [
          "a",
          "b",
          "c",
        ]),
      ).toEqual({ mode: "ids", ids: ["a", "b", "c"], lockedIds: ["a"] })
    })

    test("expands a category-wide lock to every id", () => {
      expect(
        withAllSelected({ mode: "all", lockAll: true }, ["a", "b"]),
      ).toEqual({ mode: "ids", ids: ["a", "b"], lockedIds: ["a", "b"] })
    })

    test("without a known id list it stays mode:all and keeps only a category-wide lock", () => {
      expect(
        withAllSelected(
          { mode: "ids", ids: ["a"], lockedIds: ["a"] },
          undefined,
        ),
      ).toEqual({ mode: "all", lockAll: false })
      expect(
        withAllSelected({ mode: "all", lockAll: true }, undefined),
      ).toEqual({ mode: "all", lockAll: true })
    })
  })
})

describe("summarizeSelection", () => {
  test("an all selection counts the unfiltered total and is fully selected", () => {
    expect(summarizeSelection({ mode: "all" }, 40)).toEqual({
      isAllMode: true,
      selectedCount: 40,
      allRowsSelected: true,
      someRowsSelected: false,
      allSelectedLocked: false,
    })
  })

  test("an explicit selection is indeterminate until it covers the total", () => {
    const some = summarizeSelection({ mode: "ids", ids: ["a"] }, 3)
    expect(some.someRowsSelected).toBe(true)
    expect(some.allRowsSelected).toBe(false)
    expect(
      summarizeSelection({ mode: "ids", ids: ["a", "b", "c"] }, 3)
        .allRowsSelected,
    ).toBe(true)
  })

  test("nothing selected is neither checked nor locked", () => {
    expect(summarizeSelection({ mode: "ids", ids: [] }, 3)).toEqual({
      isAllMode: false,
      selectedCount: 0,
      allRowsSelected: false,
      someRowsSelected: false,
      allSelectedLocked: false,
    })
  })

  test("lock-all is checked only when every selected item is locked", () => {
    expect(
      summarizeSelection({ mode: "ids", ids: ["a", "b"], lockedIds: ["a"] }, 5)
        .allSelectedLocked,
    ).toBe(false)
    expect(
      summarizeSelection(
        { mode: "ids", ids: ["a", "b"], lockedIds: ["a", "b"] },
        5,
      ).allSelectedLocked,
    ).toBe(true)
    expect(
      summarizeSelection({ mode: "all", lockAll: true }, 5).allSelectedLocked,
    ).toBe(true)
  })
})
