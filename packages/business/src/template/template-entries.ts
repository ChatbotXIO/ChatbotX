import type { TemplateCategory } from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"

/**
 * The category installed before the early entries (a bot field's value can
 * carry `{{coupon:<id>}}`, which needs the installed topic's id).
 */
export const COUPON_TOPICS_CATEGORY =
  "couponTopics" as const satisfies TemplateCategory

/** One resource of a template: a row, joined to its source by `sourceId`. */
export type TemplateEntry = Record<string, unknown> & { sourceId: string }

/**
 * Flattens `resources.settings.{savedReplies,botFields}` into one array with
 * an injected `kind` discriminator, matching `settingsAdapter`'s expected
 * entry shape — the only category whose stored resources aren't already a
 * flat array of `{sourceId, ...}` rows.
 */
const flattenSettingsEntries = (
  settings: TemplateExport["resources"]["settings"],
): TemplateEntry[] => [
  ...settings.savedReplies.map((entry) => ({ ...entry, kind: "savedReply" })),
  ...settings.botFields.map((entry) => ({ ...entry, kind: "botField" })),
]

export const entriesForCategory = (
  resources: TemplateExport["resources"],
  category: TemplateCategory,
): TemplateEntry[] => {
  if (category === "settings") {
    return flattenSettingsEntries(resources.settings)
  }
  const value = resources[category as keyof typeof resources]
  return Array.isArray(value) ? (value as TemplateEntry[]) : []
}

/**
 * The inverse of `entriesForCategory`: `resources` with `category`'s entries
 * replaced by `entries`. Settings are split back into saved replies and bot
 * fields by their `kind`, which `entriesForCategory` added and is dropped
 * again, so the payload keeps its shape.
 */
export const withCategoryEntries = (
  resources: TemplateExport["resources"],
  category: TemplateCategory,
  entries: readonly TemplateEntry[],
): TemplateExport["resources"] => {
  if (category !== "settings") {
    return { ...resources, [category]: entries }
  }
  const byKind = (kind: string) =>
    entries
      .filter((entry) => entry.kind === kind)
      .map(({ kind: _kind, ...entry }) => entry)
  return {
    ...resources,
    settings: {
      ...resources.settings,
      savedReplies: byKind("savedReply"),
      botFields: byKind("botField"),
    } as TemplateExport["resources"]["settings"],
  }
}
