import type { TemplateCategory } from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"

/**
 * The category installed before the early entries (a bot field's value can
 * carry `{{coupon:<id>}}`, which needs the installed topic's id).
 */
export const COUPON_TOPICS_CATEGORY =
  "couponTopics" as const satisfies TemplateCategory

/**
 * Flattens `resources.settings.{savedReplies,botFields}` into one array with
 * an injected `kind` discriminator, matching `settingsAdapter`'s expected
 * entry shape — the only category whose stored resources aren't already a
 * flat array of `{sourceId, ...}` rows.
 */
const flattenSettingsEntries = (
  settings: TemplateExport["resources"]["settings"],
): (Record<string, unknown> & { sourceId: string })[] => [
  ...settings.savedReplies.map((entry) => ({ ...entry, kind: "savedReply" })),
  ...settings.botFields.map((entry) => ({ ...entry, kind: "botField" })),
]

export const entriesForCategory = (
  resources: TemplateExport["resources"],
  category: TemplateCategory,
): (Record<string, unknown> & { sourceId: string })[] => {
  if (category === "settings") {
    return flattenSettingsEntries(resources.settings)
  }
  const value = resources[category as keyof typeof resources]
  return Array.isArray(value)
    ? (value as (Record<string, unknown> & { sourceId: string })[])
    : []
}
