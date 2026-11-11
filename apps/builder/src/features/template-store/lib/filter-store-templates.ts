import { normalizeSearchText } from "./normalize-search-text"

export type StoreCatalogTemplate = {
  templateId: string
  name: string
  publisherName: string | null
  description: string | null
  imageUrl: string
  /** The template's public page on this host, key included. */
  href: string
  categoryIds: string[]
}

/** The templates of one category whose name or publisher contains the search words, in the order given. */
export const filterStoreTemplates = (input: {
  templates: readonly StoreCatalogTemplate[]
  categoryId: string | undefined
  query: string
}): StoreCatalogTemplate[] => {
  const needle = normalizeSearchText(input.query.trim())
  return input.templates.filter(
    (template) =>
      (input.categoryId === undefined ||
        template.categoryIds.includes(input.categoryId)) &&
      (needle === "" ||
        normalizeSearchText(
          `${template.name} ${template.publisherName ?? ""}`,
        ).includes(needle)),
  )
}

/**
 * Whether category chips are worth showing. They only help when they narrow
 * the list: with no category, or a single one that holds every template,
 * "All" and the category would show the same thing.
 */
export const shouldShowCategoryFilter = (input: {
  categories: readonly { id: string }[]
  templates: readonly StoreCatalogTemplate[]
}): boolean => {
  const [onlyCategory, ...others] = input.categories
  if (!onlyCategory) {
    return false
  }
  return (
    others.length > 0 ||
    input.templates.some(
      (template) => !template.categoryIds.includes(onlyCategory.id),
    )
  )
}
