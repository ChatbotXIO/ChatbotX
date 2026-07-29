import { describe, expect, test } from "vitest"
import {
  flattenTree,
  groupByParent,
  rootsOf,
} from "@/features/product-categories/lib/category-tree"

const category = (id: string, parentId: string | null = null) => ({
  id,
  parentId,
})

describe("groupByParent", () => {
  test("indexes children under their parent and leaves roots out", () => {
    const grouped = groupByParent([
      category("men"),
      category("shirts", "men"),
      category("shoes", "men"),
      category("women"),
    ])

    expect(grouped.get("men")?.map(({ id }) => id)).toEqual(["shirts", "shoes"])
    expect(grouped.has("women")).toBe(false)
  })

  test("keeps the order the rows arrived in", () => {
    const grouped = groupByParent([category("b", "men"), category("a", "men")])

    expect(grouped.get("men")?.map(({ id }) => id)).toEqual(["b", "a"])
  })

  test("returns an empty index for an empty list", () => {
    expect(groupByParent([]).size).toBe(0)
  })
})

describe("rootsOf", () => {
  test("keeps only the top-level rows", () => {
    const roots = rootsOf([
      category("men"),
      category("shirts", "men"),
      category("women"),
    ])

    expect(roots.map(({ id }) => id)).toEqual(["men", "women"])
  })
})

describe("flattenTree", () => {
  test("places every child directly after its parent", () => {
    const flat = flattenTree([
      category("men"),
      category("women"),
      category("shirts", "men"),
      category("dresses", "women"),
    ])

    expect(flat.map(({ id }) => id)).toEqual([
      "men",
      "shirts",
      "women",
      "dresses",
    ])
  })

  test("keeps an orphaned child instead of dropping it", () => {
    const flat = flattenTree([
      category("men"),
      category("stray", "deleted-parent"),
    ])

    expect(flat.map(({ id }) => id)).toEqual(["men", "stray"])
  })

  test("lists each row exactly once", () => {
    const flat = flattenTree([
      category("men"),
      category("shirts", "men"),
      category("women"),
    ])

    expect(new Set(flat.map(({ id }) => id)).size).toBe(flat.length)
  })

  test("handles a list with no categories at all", () => {
    expect(flattenTree([])).toEqual([])
  })
})
