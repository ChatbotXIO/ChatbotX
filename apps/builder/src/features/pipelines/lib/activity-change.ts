import type {
  PipelineActivityKind,
  PipelineItemPriority,
  PipelineItemStatus,
} from "@chatbotx.io/database/partials"

/** The before/after columns an activity row carries (all null for kinds without one). */
export type ActivityChangeFields = {
  kind: PipelineActivityKind
  fromStageId?: string | null
  toStageId?: string | null
  fromStatus?: PipelineItemStatus | null
  toStatus?: PipelineItemStatus | null
  fromValue?: number | null
  toValue?: number | null
  fromPriority?: PipelineItemPriority | null
  toPriority?: PipelineItemPriority | null
  fromDueDate?: Date | null
  toDueDate?: Date | null
  fromTitle?: string | null
  toTitle?: string | null
  /** Current names of the referenced stages/pipelines (null once deleted). */
  fromStageName?: string | null
  toStageName?: string | null
  fromPipelineName?: string | null
  pipelineName?: string | null
}

/** Display text for each attribute. */
export type ActivityChangeLabels = {
  status: (status: PipelineItemStatus) => string
  priority: (priority: PipelineItemPriority) => string
  value: (value: number) => string
  date: (date: Date) => string
}

export type ActivityChange = { from: string; to: string }

/** Shown for a cleared value or a stage/pipeline that has since been deleted. */
export const NO_ACTIVITY_VALUE = "—"

const show = <T>(value: T | null | undefined, label: (value: T) => string) =>
  value === null || value === undefined ? NO_ACTIVITY_VALUE : label(value)

type ChangeReader = (
  entry: ActivityChangeFields,
  labels: ActivityChangeLabels,
) => ActivityChange

/** "Pipeline · Stage" for one side of a transfer. */
const placeLabel = (
  pipelineName: string | null | undefined,
  stageName: string | null | undefined,
) => `${pipelineName ?? NO_ACTIVITY_VALUE} · ${stageName ?? NO_ACTIVITY_VALUE}`

/** Kinds that change one scalar attribute, and how to read both sides of it. */
const CHANGE_READERS: Partial<Record<PipelineActivityKind, ChangeReader>> = {
  stageChanged: (entry) => ({
    from: show(entry.fromStageName, String),
    to: show(entry.toStageName, String),
  }),
  transferred: (entry) => ({
    from: placeLabel(entry.fromPipelineName, entry.fromStageName),
    to: placeLabel(entry.pipelineName, entry.toStageName),
  }),
  statusChanged: (entry, labels) => ({
    from: show(entry.fromStatus, labels.status),
    to: show(entry.toStatus, labels.status),
  }),
  valueChanged: (entry, labels) => ({
    from: show(entry.fromValue, labels.value),
    to: show(entry.toValue, labels.value),
  }),
  priorityChanged: (entry, labels) => ({
    from: show(entry.fromPriority, labels.priority),
    to: show(entry.toPriority, labels.priority),
  }),
  dueDateChanged: (entry, labels) => ({
    from: show(entry.fromDueDate, labels.date),
    to: show(entry.toDueDate, labels.date),
  }),
  titleChanged: (entry) => ({
    from: show(entry.fromTitle, String),
    to: show(entry.toTitle, String),
  }),
}

/** The old → new pair of a scalar change, or null for kinds that carry none (comments, attachments…). */
export function activityChange(
  entry: ActivityChangeFields,
  labels: ActivityChangeLabels,
): ActivityChange | null {
  return CHANGE_READERS[entry.kind]?.(entry, labels) ?? null
}
