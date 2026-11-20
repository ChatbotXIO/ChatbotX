import {
  type TemplateResourceCategory,
  templateResourceCategories,
} from "@chatbotx.io/database/partials"
import {
  TEMPLATE_EXPORT_FORMAT_VERSION,
  type TemplateFormatVersion,
} from "@chatbotx.io/flow-config"

type CategoryResult = {
  entries: readonly (Record<string, unknown> & { sourceId: string })[]
}

/**
 * Registry-driven helpers that take the registry as a parameter, so they hold
 * no import of the adapters themselves (and callers that stub the registry get
 * the stub's view).
 */
/**
 * The lowest payload version that can carry what was collected: the maximum
 * `minFormatVersion` of the categories that have entries (1 when none needs more).
 */
export const requiredFormatVersion = (
  registry: Partial<
    Record<
      TemplateResourceCategory,
      { minFormatVersion?: TemplateFormatVersion }
    >
  >,
  results: Partial<Record<TemplateResourceCategory, CategoryResult>>,
): TemplateFormatVersion => {
  let version: TemplateFormatVersion = TEMPLATE_EXPORT_FORMAT_VERSION
  for (const category of Object.keys(registry) as TemplateResourceCategory[]) {
    const minimum = registry[category]?.minFormatVersion ?? 1
    if (minimum > version && (results[category]?.entries.length ?? 0) > 0) {
      version = minimum
    }
  }
  return version
}

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
