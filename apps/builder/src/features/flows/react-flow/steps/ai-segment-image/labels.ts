import type {
  AISegmentImageMatchSelection,
  StateType,
} from "@chatbotx.io/flow-config"

export const matchSelectionLabelKeys = {
  largest: "fields.aiSegmentImage.matchSelection.options.largest",
  all: "fields.aiSegmentImage.matchSelection.options.all",
} as const satisfies Record<AISegmentImageMatchSelection, string>

export const stateLabelKeys = {
  success: "fields.aiSegmentImage.states.success",
  skip: "fields.aiSegmentImage.states.skip",
  error: "fields.aiSegmentImage.states.error",
} as const satisfies Record<StateType, string>
