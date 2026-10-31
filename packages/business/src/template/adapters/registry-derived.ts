import {
  type TemplateResourceCategory,
  templateResourceCategories,
} from "@chatbotx.io/database/partials"

type CategoryResult = {
  entries: readonly (Record<string, unknown> & { sourceId: string })[]
}

/**
 * Registry-driven helpers that take the registry as a parameter, so they hold
 * no import of the adapters themselves (and callers that stub the registry get
 * the stub's view).
 */
export const categoriesRequiringV2 = (
  registry: Partial<
    Record<TemplateResourceCategory, { minFormatVersion?: number }>
  >,
): TemplateResourceCategory[] =>
  (Object.keys(registry) as TemplateResourceCategory[]).filter(
    (category) => (registry[category]?.minFormatVersion ?? 1) >= 2,
  )

/**
 * The payload's `resources` object: one key per resource category (a category
 * nobody collected is an empty list), settings as its two arrays. A new
 * category needs no edit here; the caller validates the result with
 * `parseTemplateExport`.
 */
export const buildPayloadResources = (
  resultsByCategory: Partial<Record<TemplateResourceCategory, CategoryResult>>,
): Record<string, unknown> => {
  const resources: Record<string, unknown> = {}
  for (const category of templateResourceCategories.options) {
    const entries = resultsByCategory[category]?.entries ?? []
    resources[category] =
      category === "settings"
        ? {
            savedReplies: entries.filter(
              (entry) => entry.kind === "savedReply",
            ),
            botFields: entries.filter((entry) => entry.kind === "botField"),
          }
        : entries
  }
  return resources
}
