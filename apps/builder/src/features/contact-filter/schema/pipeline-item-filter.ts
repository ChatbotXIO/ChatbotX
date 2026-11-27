import {
  MAX_PIPELINE_ITEM_FILTER_STAGE_IDS,
  operatorTypes,
  PIPELINE_ITEM_EXISTS_VALUES,
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { isFilterValueId } from "./value-labels"

const pipelineIdSchema = z
  .string()
  .refine(isFilterValueId, "Invalid pipeline id")

const PIPELINE_ID_DESCRIPTION =
  "Pipeline id from `pipelines.list`; `null` = any pipeline."
const REQUIRED_PIPELINE_ID_DESCRIPTION =
  "Pipeline id from `pipelines.list`. Required: stages belong to one pipeline."

const base = {
  field: z
    .literal("pipelineItem")
    .describe("Always `pipelineItem` for a pipeline item condition."),
}

const EXISTS_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
] as const
const MEMBERSHIP_OPERATORS = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
] as const

export const PIPELINE_ITEM_EXISTS_OPERATORS = EXISTS_OPERATORS
export const PIPELINE_ITEM_MEMBERSHIP_OPERATORS = MEMBERSHIP_OPERATORS

const existsConditionSchema = z.object({
  ...base,
  attribute: z
    .literal("exists")
    .describe("Whether the contact has (or has no) matching item."),
  pipelineId: pipelineIdSchema.nullable().describe(PIPELINE_ID_DESCRIPTION),
  operator: z
    .enum(EXISTS_OPERATORS)
    .describe("`isNotEmpty` = has an item, `isEmpty` = has no item."),
  value: z
    .enum(PIPELINE_ITEM_EXISTS_VALUES)
    .describe("Item status to look for: `any`, `open`, `won` or `lost`."),
})

const statusConditionSchema = z.object({
  ...base,
  attribute: z.literal("status").describe("Status of the contact's items."),
  pipelineId: pipelineIdSchema.nullable().describe(PIPELINE_ID_DESCRIPTION),
  operator: z
    .enum(MEMBERSHIP_OPERATORS)
    .describe(
      "`in` = some item has one of the statuses, `notIn` = no item does (also matches contacts without items).",
    ),
  value: z.array(pipelineItemStatuses).min(1).max(3),
})

const stageConditionSchema = z.object({
  ...base,
  attribute: z.literal("stage").describe("Stage of the contact's items."),
  pipelineId: pipelineIdSchema.describe(REQUIRED_PIPELINE_ID_DESCRIPTION),
  operator: z
    .enum(MEMBERSHIP_OPERATORS)
    .describe(
      "`in` = some item sits in one of the stages, `notIn` = no item does (also matches contacts without items).",
    ),
  value: z
    .array(z.string().refine(isFilterValueId, "Invalid stage id"))
    .min(1)
    .max(MAX_PIPELINE_ITEM_FILTER_STAGE_IDS)
    .describe(
      "Stage ids of `pipelineId`. Get them from `pipelines.get` or `contacts.listFilterFields`.",
    ),
})

const priorityConditionSchema = z.object({
  ...base,
  attribute: z.literal("priority").describe("Priority of the contact's items."),
  pipelineId: pipelineIdSchema.nullable().describe(PIPELINE_ID_DESCRIPTION),
  operator: z
    .enum(MEMBERSHIP_OPERATORS)
    .describe(
      "`in` = some item has one of the priorities, `notIn` = no item does (also matches contacts without items).",
    ),
  value: z.array(pipelineItemPriorities).min(1).max(3),
})

/**
 * "Pipeline item" condition. Like coupon topics and leaderboards the field is
 * dynamic (it carries a runtime `pipelineId`), and it is a union on
 * `attribute` because each attribute has its own operator and value shape.
 */
export const pipelineItemConditionSchema = z.discriminatedUnion("attribute", [
  existsConditionSchema,
  statusConditionSchema,
  stageConditionSchema,
  priorityConditionSchema,
])

export type PipelineItemCondition = z.infer<typeof pipelineItemConditionSchema>

export type PipelineItemAttributeDescriptor = {
  attribute: PipelineItemCondition["attribute"]
  operators: readonly string[]
  /** `true` when the condition cannot be built without a `pipelineId`. */
  pipelineIdRequired: boolean
  /** `value` is a single string (`single`) or a non-empty array (`list`). */
  valueShape: "single" | "list"
  /** Fixed accepted values; empty when they are ids (stages). */
  values: readonly string[]
}

/** What discovery tells an agent about each attribute; mirrors the Zod union. */
export const PIPELINE_ITEM_ATTRIBUTE_DESCRIPTORS: readonly PipelineItemAttributeDescriptor[] =
  [
    {
      attribute: "exists",
      operators: EXISTS_OPERATORS,
      pipelineIdRequired: false,
      valueShape: "single",
      values: PIPELINE_ITEM_EXISTS_VALUES,
    },
    {
      attribute: "status",
      operators: MEMBERSHIP_OPERATORS,
      pipelineIdRequired: false,
      valueShape: "list",
      values: pipelineItemStatuses.options,
    },
    {
      attribute: "stage",
      operators: MEMBERSHIP_OPERATORS,
      pipelineIdRequired: true,
      valueShape: "list",
      values: [],
    },
    {
      attribute: "priority",
      operators: MEMBERSHIP_OPERATORS,
      pipelineIdRequired: false,
      valueShape: "list",
      values: pipelineItemPriorities.options,
    },
  ]
