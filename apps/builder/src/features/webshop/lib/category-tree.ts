type TreeCategory = { id: string; parentId?: string | null }

/**
 * The shop's categories as top-level ones, each with its sub-categories, in
 * the order given. Categories are two levels deep, and the storefront only
 * sends a sub-category whose parent it sends too.
 */
export const groupCategoriesByParent = <TCategory extends TreeCategory>(
  categories: TCategory[],
): Array<{ category: TCategory; subcategories: TCategory[] }> =>
  categories
    .filter((category) => !category.parentId)
    .map((category) => ({
      category,
      subcategories: categories.filter(
        (child) => child.parentId === category.id,
      ),
    }))
