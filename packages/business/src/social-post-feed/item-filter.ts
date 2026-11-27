import type { SocialPostFeedFilters } from "@chatbotx.io/database/partials"

const HOUR_MS = 60 * 60 * 1000
const COMBINING_MARKS = /\p{M}/gu

/** Lower-cases and strips diacritics (`Đà Nẵng` -> `da nang`) so keywords match however they are typed. */
export const foldText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase()

export type FilterableItem = {
  categories: readonly string[]
  publishedAt: Date | null
  summary: string | null
  title: string | null
}

export type FilterVerdict =
  | { pass: true }
  | {
      pass: false
      /** Stable code stored as the ledger `reason`. */
      reason:
        | "excludedKeyword"
        | "missingKeyword"
        | "category"
        | "noImage"
        | "tooOldForFilter"
        | "undatedForFilter"
    }

const containsAny = (haystack: string, terms: readonly string[]): boolean =>
  terms.some((term) => {
    const needle = foldText(term).trim()
    return needle !== "" && haystack.includes(needle)
  })

/**
 * Whether an item passes a feed's filters. Applied before the per-run and
 * daily capacity, so an item the filters drop never uses a slot. `hasImage` is
 * whether the item names a picture at all (a candidate or a field that yields
 * an address); whether the picture can be imported is only known later, and a
 * failure there is handled by the feed's no-picture fallback.
 *
 * `maxAgeHours`: an undated item cannot be proven recent and fails; an item
 * dated in the future counts as just published.
 */
export const evaluateItemFilters = (
  filters: SocialPostFeedFilters | null | undefined,
  item: FilterableItem,
  context: { hasImage: boolean; now: Date },
): FilterVerdict => {
  if (!filters) {
    return { pass: true }
  }
  const text = foldText(
    `${item.title ?? ""}\n${item.summary ?? ""}\n${item.categories.join("\n")}`,
  )
  if (filters.excludeAny?.length && containsAny(text, filters.excludeAny)) {
    return { pass: false, reason: "excludedKeyword" }
  }
  if (filters.includeAny?.length && !containsAny(text, filters.includeAny)) {
    return { pass: false, reason: "missingKeyword" }
  }
  if (filters.categoriesAny?.length) {
    const categories = foldText(item.categories.join("\n"))
    if (!containsAny(categories, filters.categoriesAny)) {
      return { pass: false, reason: "category" }
    }
  }
  if (filters.requireImage && !context.hasImage) {
    return { pass: false, reason: "noImage" }
  }
  if (filters.maxAgeHours !== undefined) {
    if (!item.publishedAt) {
      return { pass: false, reason: "undatedForFilter" }
    }
    const age = Math.max(0, context.now.getTime() - item.publishedAt.getTime())
    if (age > filters.maxAgeHours * HOUR_MS) {
      return { pass: false, reason: "tooOldForFilter" }
    }
  }
  return { pass: true }
}
