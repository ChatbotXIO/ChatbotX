import type {
  PipelineActivityKind,
  PipelineType,
} from "@chatbotx.io/database/partials"

/** What an item is called for each pipeline type (UI noun, translated). */
export const itemNounKeys = {
  opportunity: {
    one: "noun.opportunity.one",
    many: "noun.opportunity.many",
    add: "noun.opportunity.add",
  },
  ticket: {
    one: "noun.ticket.one",
    many: "noun.ticket.many",
    add: "noun.ticket.add",
  },
  custom: {
    one: "noun.card.one",
    many: "noun.card.many",
    add: "noun.card.add",
  },
} as const satisfies Record<
  PipelineType,
  { one: string; many: string; add: string }
>

export const pipelineTypeKeys = {
  opportunity: {
    label: "types.opportunity.label",
    description: "types.opportunity.description",
  },
  ticket: {
    label: "types.ticket.label",
    description: "types.ticket.description",
  },
  custom: {
    label: "types.custom.label",
    description: "types.custom.description",
  },
} as const satisfies Record<
  PipelineType,
  { label: string; description: string }
>

export const priorityKeys = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high",
} as const

/** Tailwind classes of the card priority flag. */
export const priorityFlagClass = {
  low: "text-green-600",
  medium: "text-yellow-500",
  high: "text-red-600",
} as const

export const statusFilterKeys = {
  open: "filter.statusLabels.open",
  won: "filter.statusLabels.won",
  lost: "filter.statusLabels.lost",
} as const

/** One line per activity kind, for the item history. */
export const activityKeys = {
  created: "activity.created",
  stageChanged: "activity.stageChanged",
  statusChanged: "activity.statusChanged",
  valueChanged: "activity.valueChanged",
  priorityChanged: "activity.priorityChanged",
  dueDateChanged: "activity.dueDateChanged",
  titleChanged: "activity.titleChanged",
  descriptionChanged: "activity.descriptionChanged",
  fieldValuesChanged: "activity.fieldValuesChanged",
  assigneesChanged: "activity.assigneesChanged",
  attachmentAdded: "activity.attachmentAdded",
  attachmentRemoved: "activity.attachmentRemoved",
  commentAdded: "activity.commentAdded",
  commentDeleted: "activity.commentDeleted",
  transferred: "activity.transferred",
  deleted: "activity.deleted",
} as const satisfies Record<PipelineActivityKind, string>
