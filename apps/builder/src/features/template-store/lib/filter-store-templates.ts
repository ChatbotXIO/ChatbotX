import type { TemplateStoreAudienceSection } from "@chatbotx.io/business"
import {
  orderedTemplateChannels,
  type TemplateChannel,
} from "@chatbotx.io/database/partials"
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
  /** Channels the template supports, in display order; empty = every channel. */
  channels: TemplateChannel[]
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

/** Whether a template works on a channel: tagged with it, or tagged with none (every channel). */
const matchesChannel = (
  template: StoreCatalogTemplate,
  channel: TemplateChannel,
): boolean =>
  template.channels.length === 0 || template.channels.includes(channel)

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

/** The channel tabs: every channel at least one template names (untagged ones add none), in the fixed channel order. */
export const listStoreChannelOptions = (
  templates: readonly StoreCatalogTemplate[],
): TemplateChannel[] => {
  const present = new Set(templates.flatMap((template) => template.channels))
  return orderedTemplateChannels.filter((channel) => present.has(channel))
}

/** The tab for the URL's `channel`: a listed one, or (missing, stale, nothing carries it) `undefined` = all channels. */
export const resolveStoreChannel = (input: {
  param: TemplateChannel | null
  options: readonly TemplateChannel[]
}): TemplateChannel | undefined =>
  input.param !== null && input.options.includes(input.param)
    ? input.param
    : undefined

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

/** The templates of one channel and language whose name or publisher contains the search words, in the order given. */
export const filterStoreTemplates = (input: {
  templates: readonly StoreCatalogTemplate[]
  channel: TemplateChannel | undefined
  languageView: StoreLanguageView
  query: string
}): StoreCatalogTemplate[] => {
  const needle = normalizeSearchText(input.query.trim())
  return input.templates.filter(
    (template) =>
      (input.channel === undefined ||
        matchesChannel(template, input.channel)) &&
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
 * Whether a template works on every channel: it names none (empty = every
 * channel) or names all of them. Display only; what the admin selected is
 * stored as is.
 */
export const coversEveryTemplateChannel = (
  channels: readonly TemplateChannel[],
): boolean =>
  channels.length === 0 ||
  orderedTemplateChannels.every((channel) => channels.includes(channel))

/** One block of the store page: a category with its templates, or (`category` null) the ones in none. */
export type StoreCategorySection = {
  /** The category id, or `uncategorized`. */
  key: string
  category: StoreCatalogCategory | null
  templates: StoreCatalogTemplate[]
}

const STORE_UNCATEGORIZED_KEY = "uncategorized"

/**
 * Splits templates into one section per category, the fullest first (equal
 * counts sort by category name for `locale`). A template in several categories is in each;
 * one in none of the listed categories goes into a last, uncategorized section,
 * which is never ranked. Empty sections are left out, and each keeps the order
 * the templates came in.
 */
export const groupStoreTemplatesByCategory = (
  templates: readonly StoreCatalogTemplate[],
  categories: readonly StoreCatalogCategory[],
  locale: string,
): StoreCategorySection[] => {
  const collator = new Intl.Collator(locale, {
    sensitivity: "base",
    numeric: true,
  })
  const listedIds = new Set(categories.map((category) => category.id))
  const ranked = categories
    .map((category) => ({
      key: category.id,
      category,
      templates: templates.filter((template) =>
        template.categoryIds.includes(category.id),
      ),
    }))
    .filter((section) => section.templates.length > 0)
    .sort(
      (a, b) =>
        b.templates.length - a.templates.length ||
        collator.compare(a.category.name, b.category.name),
    )
  const uncategorized = templates.filter(
    (template) => !template.categoryIds.some((id) => listedIds.has(id)),
  )
  return uncategorized.length === 0
    ? ranked
    : [
        ...ranked,
        {
          key: STORE_UNCATEGORIZED_KEY,
          category: null,
          templates: uncategorized,
        },
      ]
}
