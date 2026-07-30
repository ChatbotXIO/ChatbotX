import type { ProductCategoryResource } from "../schema/resource"

/**
 * The category tree always travels as a flat, already-ranked list, so every
 * screen that shows it has to rebuild the hierarchy from `parentId`. These
 * helpers are that rebuild, kept in one place: the sidebar, the management tab
 * and the product form each need a different slice of the same structure, and
 * three hand-rolled passes had already drifted apart on how they treat orphans.
 *
 * Everything below is a single pass over the input and preserves the incoming
 * order, which is the query's `rank, name` ordering.
 */

type CategoryNode = Pick<ProductCategoryResource, "id" | "parentId">

/** Children indexed by their parent's id. Top-level rows are not included. */
export const groupByParent = <T extends CategoryNode>(
  categories: T[],
): Map<string, T[]> => {
  const byParent = new Map<string, T[]>()
  for (const category of categories) {
    if (!category.parentId) {
      continue
    }
    const siblings = byParent.get(category.parentId)
    if (siblings) {
      siblings.push(category)
    } else {
      byParent.set(category.parentId, [category])
    }
  }
  return byParent
}

/** Top-level categories, in the order they arrived. */
export const rootsOf = <T extends CategoryNode>(categories: T[]): T[] =>
  categories.filter((category) => !category.parentId)

/**
 * One flat list in which every child directly follows its parent, so a plain
 * list rendering still reads as a tree. A row whose parent is missing from the
 * input falls to the end rather than disappearing — the parent may have been
 * filtered out upstream, and dropping the child would look like data loss.
 */
export const flattenTree = <T extends CategoryNode>(categories: T[]): T[] => {
  const byParent = groupByParent(categories)
  const ordered = rootsOf(categories).flatMap((root) => [
    root,
    ...(byParent.get(root.id) ?? []),
  ])
  const placed = new Set(ordered.map((category) => category.id))
  return [...ordered, ...categories.filter(({ id }) => !placed.has(id))]
}

/** A category plus what the table row needs that the category itself cannot say. */
export type CategoryTableRow<T> = {
  category: T
  /** 0 for a top-level row, 1 for a sub-category. Drives the indent. */
  depth: number
  /** Whether the row gets a chevron, and what the sub-category column shows. */
  childCount: number
}

/**
 * The rows the management table actually renders: parents in the query's order,
 * each expanded parent immediately followed by its children.
 *
 * Collapsing is applied here rather than in the component so that `depth` and
 * `childCount` are derived from the same pass that decides visibility — the
 * previous card grid recomputed child counts separately and could disagree with
 * what it had drawn.
 *
 * The walk is two levels deep on purpose: `productCategoryService` rejects a
 * third, so descending further would be dead code. A row whose parent is absent
 * from the input is treated as top-level rather than dropped — the parent may
 * have been filtered out upstream, and hiding the child would look like data
 * loss.
 */
export const toTableRows = <T extends CategoryNode>(
  categories: T[],
  expandedIds: ReadonlySet<string>,
): CategoryTableRow<T>[] => {
  const byParent = groupByParent(categories)
  const known = new Set(categories.map(({ id }) => id))
  const childCountOf = (id: string) => byParent.get(id)?.length ?? 0

  return categories
    .filter(({ parentId }) => !(parentId && known.has(parentId)))
    .flatMap((parent) => {
      const row = {
        category: parent,
        depth: 0,
        childCount: childCountOf(parent.id),
      }
      if (!expandedIds.has(parent.id)) {
        return [row]
      }
      return [
        row,
        ...(byParent.get(parent.id) ?? []).map((child) => ({
          category: child,
          depth: 1,
          childCount: childCountOf(child.id),
        })),
      ]
    })
}
