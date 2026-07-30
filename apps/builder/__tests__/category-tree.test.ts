import { describe, expect, test } from "vitest"
import {
  flattenTree,
  groupByParent,
  rootsOf,
  toTableRows,
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

describe("toTableRows", () => {
  const expandAll = (...ids: string[]) => new Set(ids)

  test("puts each expanded parent's children right below it", () => {
    const rows = toTableRows(
      [
        category("men"),
        category("women"),
        category("shirts", "men"),
        category("dresses", "women"),
      ],
      expandAll("men", "women"),
    )

    expect(rows.map(({ category: { id } }) => id)).toEqual([
      "men",
      "shirts",
      "women",
      "dresses",
    ])
  })

  test("indents children one level below their parent", () => {
    const rows = toTableRows(
      [category("men"), category("shirts", "men")],
      expandAll("men"),
    )

    expect(rows.map(({ depth }) => depth)).toEqual([0, 1])
  })

  test("hides the children of a collapsed parent but keeps the parent", () => {
    const rows = toTableRows(
      [
        category("men"),
        category("shirts", "men"),
        category("shoes", "men"),
        category("women"),
      ],
      expandAll("women"),
    )

    expect(rows.map(({ category: { id } }) => id)).toEqual(["men", "women"])
  })

  test("reports the child count of a collapsed parent", () => {
    const rows = toTableRows(
      [category("men"), category("shirts", "men"), category("shoes", "men")],
      expandAll(),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.childCount).toBe(2)
  })

  test("reports no children for a sub-category", () => {
    const rows = toTableRows(
      [category("men"), category("shirts", "men")],
      expandAll("men"),
    )

    expect(rows[1]?.childCount).toBe(0)
  })

  test("shows an orphaned child at the top level, in place", () => {
    const rows = toTableRows(
      [category("men"), category("stray", "deleted-parent"), category("women")],
      expandAll("men", "women"),
    )

    expect(rows.map(({ category: { id }, depth }) => [id, depth])).toEqual([
      ["men", 0],
      ["stray", 0],
      ["women", 0],
    ])
  })

  test("keeps the order the rows arrived in", () => {
    const rows = toTableRows(
      [category("women"), category("men"), category("shirts", "men")],
      expandAll("men"),
    )

    expect(rows.map(({ category: { id } }) => id)).toEqual([
      "women",
      "men",
      "shirts",
    ])
  })

  test("lists each row exactly once", () => {
    const rows = toTableRows(
      [category("men"), category("shirts", "men"), category("women")],
      expandAll("men", "women"),
    )

    expect(new Set(rows.map(({ category: { id } }) => id)).size).toBe(
      rows.length,
    )
  })

  test("handles a list with no categories at all", () => {
    expect(toTableRows([], expandAll())).toEqual([])
  })
})
