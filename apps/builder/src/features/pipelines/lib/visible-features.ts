import type { PipelineSettings } from "@chatbotx.io/database/partials"

type HideableFeature = "value" | "priority" | "dueDate"

const HIDEABLE_FEATURES = [
  "value",
  "priority",
  "dueDate",
] as const satisfies readonly HideableFeature[]

/**
 * Keys of the features a pipeline turned off. They double as sort keys and
 * filter row ids, so a hidden feature is neither sortable nor filterable.
 */
export const hiddenFeatureKeys = (
  features: Partial<PipelineSettings["visibleFeatures"]> | undefined,
): ReadonlySet<string> =>
  new Set<string>(HIDEABLE_FEATURES.filter((key) => features?.[key] === false))

/** A hidden feature never shows on a card, whatever the card-element toggles say. */
export function visibleCardElements(settings: PipelineSettings) {
  const { cardElements, visibleFeatures } = settings
  return {
    ...cardElements,
    value: cardElements.value && visibleFeatures.value,
    priority: cardElements.priority && visibleFeatures.priority,
    dueDate: cardElements.dueDate && visibleFeatures.dueDate,
  }
}
