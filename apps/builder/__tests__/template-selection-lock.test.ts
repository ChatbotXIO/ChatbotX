import { describe, expect, test } from "vitest"
import {
  explicitSelection,
  isItemLocked,
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
