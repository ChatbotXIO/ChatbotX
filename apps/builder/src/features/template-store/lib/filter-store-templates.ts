import type { TemplateStoreAudienceSection } from "@chatbotx.io/business"
import { normalizeSearchText } from "./normalize-search-text"

export type StoreCatalogCategory = { id: string; name: string }

export type StoreCatalogTemplate = {
  templateId: string
  name: string
  publisherName: string | null
  description: string | null
  imageUrl: string
  /** The template's public page on this host, key included. */
  href: string
  categoryIds: string[]
  /** UI locale codes; empty = every language. */
  languages: string[]
  /** Zone when the visitor views their own language: `primary` on top, `other` under the divider, `hidden` left out. */
  section: TemplateStoreAudienceSection
}

/** The language filter's value that shows every template, whatever its language. */
export const STORE_ALL_LANGUAGES = "all"

/**
 * How the store lists templates for the chosen language: `own` (the visitor's
 * language, the default) applies the audience zones, `all` shows everything,
 * `single` is another language picked in the filter.
 */
export type StoreLanguageMode = "own" | "all" | "single"

export type StoreLanguageView = {
  mode: StoreLanguageMode
  /** The filter's selected value: a locale code, or `STORE_ALL_LANGUAGES`. */
  value: string
}

/** Whether a template is shown for a language: tagged with it, or tagged with none (every language). */
const matchesLanguage = (
  template: StoreCatalogTemplate,
  language: string,
): boolean =>
  template.languages.length === 0 || template.languages.includes(language)

/** Which templates each mode keeps. */
const LANGUAGE_MODE_MATCHERS: Record<
  StoreLanguageMode,
  (template: StoreCatalogTemplate, language: string) => boolean
> = {
  own: (template) => template.section !== "hidden",
  all: () => true,
  single: matchesLanguage,
}

/** The filter's languages: the visitor's own first, then every other one the templates carry. */
export const listStoreLanguageOptions = (
  templates: readonly StoreCatalogTemplate[],
  viewerLocale: string,
): string[] => [
  ...new Set([
    viewerLocale,
    ...templates.flatMap((template) => template.languages),
  ]),
]

/** The view for the URL's `lang`: `all`, another listed language, or (missing, stale, the visitor's own) the visitor's language. */
export const resolveStoreLanguageView = (input: {
  param: string | null
  options: readonly string[]
  viewerLocale: string
}): StoreLanguageView => {
  if (input.param === STORE_ALL_LANGUAGES) {
    return { mode: "all", value: STORE_ALL_LANGUAGES }
  }
  if (
    input.param !== null &&
    input.param !== input.viewerLocale &&
    input.options.includes(input.param)
  ) {
    return { mode: "single", value: input.param }
  }
  return { mode: "own", value: input.viewerLocale }
}

export type StoreSections = {
  primary: StoreCatalogTemplate[]
  other: StoreCatalogTemplate[]
}

/** Templates tagged with the language first, then the untagged ones; each group keeps its order (newest first). */
const taggedFirst = (
  templates: readonly StoreCatalogTemplate[],
  language: string,
): StoreCatalogTemplate[] => [
  ...templates.filter((template) => template.languages.includes(language)),
  ...templates.filter((template) => !template.languages.includes(language)),
]

/** How each mode lays out its templates. Only the visitor's own language has a lower zone. */
const SECTION_LAYOUTS: Record<
  StoreLanguageMode,
  (
    templates: readonly StoreCatalogTemplate[],
    language: string,
  ) => StoreSections
> = {
  own: (templates, language) => ({
    primary: taggedFirst(
      templates.filter((template) => template.section === "primary"),
      language,
    ),
    other: templates.filter((template) => template.section === "other"),
  }),
  single: (templates, language) => ({
    primary: taggedFirst(templates, language),
    other: [],
  }),
  all: (templates) => ({ primary: [...templates], other: [] }),
}

/** The zones of a view, in display order. */
export const splitStoreSections = (
  templates: readonly StoreCatalogTemplate[],
  view: StoreLanguageView,
): StoreSections => SECTION_LAYOUTS[view.mode](templates, view.value)

/** The templates of one category and language whose name or publisher contains the search words, in the order given. */
export const filterStoreTemplates = (input: {
  templates: readonly StoreCatalogTemplate[]
  categoryId: string | undefined
  languageView: StoreLanguageView
  query: string
}): StoreCatalogTemplate[] => {
  const needle = normalizeSearchText(input.query.trim())
  return input.templates.filter(
    (template) =>
      (input.categoryId === undefined ||
        template.categoryIds.includes(input.categoryId)) &&
      LANGUAGE_MODE_MATCHERS[input.languageView.mode](
        template,
        input.languageView.value,
      ) &&
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
