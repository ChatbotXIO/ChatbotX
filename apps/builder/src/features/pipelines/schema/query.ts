import {
  PIPELINE_LIMITS,
  pipelineActivityGroups,
  pipelineActivityKinds,
  pipelineFieldOperators,
  pipelineItemPriorities,
  pipelineItemSortKeys,
  pipelineItemStatuses,
  pipelineValueOperators,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { datePresets } from "../lib/date-presets"
import {
  boundedDate,
  hasNoNul,
  MAX_FIELD_FILTERS,
  MAX_FIELD_VALUE_LENGTH,
  NO_NUL_MESSAGE,
  statsRangeFields,
} from "./bounds"

const operandText = z
  .string()
  .max(MAX_FIELD_VALUE_LENGTH)
  .refine(hasNoNul, NO_NUL_MESSAGE)

const dateRange = z
  .object({ from: boundedDate().optional(), to: boundedDate().optional() })
  .optional()

/** Filter panel of the board; every key is optional and arrays mean "any of". */
export const pipelineItemFilterRequest = z.object({
  stageIds: z
    .array(zodBigintIdAsString())
    .max(PIPELINE_LIMITS.stagesPerPipeline)
    .optional(),
  statuses: z.array(pipelineItemStatuses).max(3).optional(),
  priorities: z.array(pipelineItemPriorities).max(3).optional(),
  assigneeMemberIds: z.array(zodBigintIdAsString()).max(100).optional(),
  assigneeTeamIds: z.array(zodBigintIdAsString()).max(100).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .refine(hasNoNul, NO_NUL_MESSAGE)
    .optional(),
  /**
   * Item value. Without `operator` it is the `min`/`max` interval; `eq/gt/lt/ne`
   * compare `amount` ("ne" also matches items without a value); `between` uses `min`/`max`.
   */
  value: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      operator: pipelineValueOperators.optional(),
      amount: z.number().optional(),
    })
    .optional(),
  dueDate: dateRange,
  createdAt: dateRange,
  updatedAt: dateRange,
  closedAt: dateRange,
  /** Items currently won/lost whose closure falls in the range ("resolved on" / "not resolved on"). */
  closedAs: z.partialRecord(z.enum(["won", "lost"]), dateRange).optional(),
  /**
   * Condition on a custom field's stored value, keyed by field id. Which
   * operators a field accepts depends on its type (`PIPELINE_FIELD_OPERATORS_BY_TYPE`);
   * the server answers 422 for one it does not, or for a missing operand.
   * `between` uses `value` as lower and `valueTo` as upper bound.
   */
  fieldConditions: z
    .record(
      zodBigintIdAsString(),
      z.object({
        operator: pipelineFieldOperators,
        value: operandText.optional(),
        valueTo: operandText.optional(),
      }),
    )
    .refine((values) => Object.keys(values).length <= MAX_FIELD_FILTERS, {
      message: "Too many field filters",
    })
    .optional(),
  /** IANA zone whose calendar days date-field conditions compare in; defaults to the workspace's. */
  timezone: statsRangeFields.timezone,
  /** The item's own latest comment time. */
  lastCommentAt: dateRange,
  /** The item's own latest status change time. */
  statusChangedAt: dateRange,
  /** When the item entered its current stage. */
  stageEnteredAt: dateRange,
  /** Matches items that had an activity of that kind (e.g. statusChanged) inside the range. */
  activity: z.partialRecord(pipelineActivityKinds, dateRange).optional(),
  /**
   * One activity row of the item (recorded in this pipeline) satisfying every
   * part set: a kind in `kinds`, done by a user in `actorUserIds` or by
   * automation, inside `occurredAt`. `actorUserIds` are user ids (not member ids).
   */
  activityMatch: z
    .object({
      kinds: z
        .array(pipelineActivityKinds)
        .max(pipelineActivityKinds.options.length)
        .optional(),
      actorUserIds: z.array(zodBigintIdAsString()).max(100).optional(),
      automation: z.boolean().optional(),
      occurredAt: dateRange,
    })
    .optional(),
})

/** Row ids of the filter sheet that hold a relative date preset. */
const PRESET_ROW_PATTERN =
  /^(dueDate|createdAt|updatedAt|statusChangedAt|stageEnteredAt|lastCommentAt|activityWhen|closedAs-won|closedAs-lost)$/

/**
 * The board filter as kept in the URL: the API filter plus `presets`, relative
 * date choices (keyed by filter row id) that are resolved to from/to ranges
 * only when the request is built, so they stay relative when reopened later.
 */
export const boardFilterState = pipelineItemFilterRequest.extend({
  presets: z
    .record(z.string().regex(PRESET_ROW_PATTERN), datePresets)
    .refine((values) => Object.keys(values).length <= MAX_FIELD_FILTERS + 12, {
      message: "Too many presets",
    })
    .optional(),
})

export const pipelineItemSortRequest = z.object({
  key: pipelineItemSortKeys.default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export const workspacePipelineRequest = z.object({
  workspaceId: zodBigintIdAsString(),
  pipelineId: zodBigintIdAsString(),
})

export const boardRequest = workspacePipelineRequest.extend({
  filter: pipelineItemFilterRequest.optional(),
  sort: pipelineItemSortRequest.optional(),
})

export const stagePageRequest = boardRequest.extend({
  stageId: zodBigintIdAsString(),
  cursor: z.string().optional(),
})

export const itemRequest = workspacePipelineRequest.extend({
  itemId: zodBigintIdAsString(),
})

/** An item's comments or activity, newest first, resumed by `cursor`. */
export const itemPageRequest = itemRequest.extend({
  cursor: z.string().optional(),
})

export const activityPageRequest = itemPageRequest.extend({
  groups: z
    .array(pipelineActivityGroups)
    .max(pipelineActivityGroups.options.length)
    .optional(),
})

export const statsRequest = workspacePipelineRequest.extend(statsRangeFields)

export const contactItemsRequest = z.object({
  workspaceId: zodBigintIdAsString(),
  contactId: zodBigintIdAsString(),
})
