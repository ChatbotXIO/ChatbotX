import { isLocale, type Locale } from "@chatbotx.io/utils/ui-locale"
import { validationException } from "../errors"

/** The UI language whose visitors only see templates made for them. */
export const TEMPLATE_STORE_SEPARATE_LOCALE: Locale = "vi"

/**
 * Where a listing goes when a visitor views the store in their own language:
 * the main list, under the divider, or left out. Viewing every language shows
 * all of them regardless.
 */
export type TemplateStoreAudienceSection = "primary" | "other" | "hidden"

/**
 * Places a listing for a visitor whose UI language is `viewerLocale`. Checked in
 * order: no languages = every language; the visitor's language; a Vietnamese
 * visitor sees nothing else; a Vietnamese-tagged template stays out of other
 * visitors' lower zone; everything else goes under the divider.
 */
export const classifyStoreListingForLocale = (
  languages: readonly string[],
  viewerLocale: Locale,
): TemplateStoreAudienceSection => {
  if (languages.length === 0 || languages.includes(viewerLocale)) {
    return "primary"
  }
  if (
    viewerLocale === TEMPLATE_STORE_SEPARATE_LOCALE ||
    languages.includes(TEMPLATE_STORE_SEPARATE_LOCALE)
  ) {
    return "hidden"
  }
  return "other"
}

/** De-duplicates and checks every value against the UI locale list. */
export const normalizeListingLanguages = (
  input: readonly string[],
): Locale[] => {
  const unique = [...new Set(input)]
  const valid = unique.filter(isLocale)
  if (valid.length !== unique.length) {
    throw validationException("languages", "Unknown language")
  }
  return valid
}
