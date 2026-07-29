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
