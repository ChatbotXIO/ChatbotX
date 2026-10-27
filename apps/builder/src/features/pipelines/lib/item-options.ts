import {
  type PipelineItemPriority,
  type PipelineItemStatus,
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "@chatbotx.io/database/partials"
import { priorityKeys, statusFilterKeys } from "./item-noun"

/** Translates the `pipelines` keys these options use. */
type ItemOptionTranslate = (
  key:
    | (typeof statusFilterKeys)[PipelineItemStatus]
    | (typeof priorityKeys)[PipelineItemPriority],
) => string

/**
 * Status choices, named by the pipeline's own labels (a ticket pipeline says
 * "Resolved"), falling back to the generic name for a blank one.
 */
export const pipelineStatusOptions = (
  t: ItemOptionTranslate,
  statusLabels?: Partial<Record<PipelineItemStatus, string>>,
): Array<{ value: PipelineItemStatus; label: string }> =>
  pipelineItemStatuses.options.map((status) => ({
    value: status,
    label: statusLabels?.[status] || t(statusFilterKeys[status]),
  }))

export const pipelinePriorityOptions = (
  t: ItemOptionTranslate,
): Array<{ value: PipelineItemPriority; label: string }> =>
  pipelineItemPriorities.options.map((priority) => ({
    value: priority,
    label: t(priorityKeys[priority]),
  }))
