import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import z from "zod"

export const pipelineTypes = z.enum(["opportunity", "ticket", "custom"])
export type PipelineType = z.infer<typeof pipelineTypes>

export const pipelineItemStatuses = z.enum(["open", "won", "lost"])
export type PipelineItemStatus = z.infer<typeof pipelineItemStatuses>

export const pipelineItemPriorities = z.enum(["low", "medium", "high"])
export type PipelineItemPriority = z.infer<typeof pipelineItemPriorities>

/** Attributes of the "pipeline item" contact filter condition. */
export const pipelineItemFilterAttributes = z.enum([
  "exists",
  "status",
  "stage",
  "priority",
])
export type PipelineItemFilterAttribute = z.infer<
  typeof pipelineItemFilterAttributes
>

/** Values of the `exists` attribute: any item, or one in that status. */
export const PIPELINE_ITEM_EXISTS_VALUES = [
  "any",
  ...pipelineItemStatuses.options,
] as const
export type PipelineItemExistsValue =
  (typeof PIPELINE_ITEM_EXISTS_VALUES)[number]

/** Most stage ids one pipeline-item condition may list. */
export const MAX_PIPELINE_ITEM_FILTER_STAGE_IDS = 200

/** The `<attr>` of `{{pipelines.<reference_name>.<attr>}}`. */
export const PIPELINE_VARIABLE_ATTRIBUTES = [
  "name",
  "stage_name",
  "status",
  "priority",
  "value",
  "assigned_admins",
  "created_date",
  "due_date",
  "updated_date",
  "id",
] as const
export type PipelineVariableAttribute =
  (typeof PIPELINE_VARIABLE_ATTRIBUTES)[number]

export const pipelineItemSortKeys = z.enum([
  "createdAt",
  "updatedAt",
  "value",
  "dueDate",
  "priority",
])
export type PipelineItemSortKey = z.infer<typeof pipelineItemSortKeys>

/** Comparison of the item's own `value` ("Equal" / "Greater than" / "Less than" / "Different" / "Interval"). */
export const pipelineValueOperators = z.enum([
  "eq",
  "gt",
  "lt",
  "ne",
  "between",
])
export type PipelineValueOperator = z.infer<typeof pipelineValueOperators>

/** Value operators that compare one `amount`; `between` takes `min`/`max`. */
export const pipelineSingleValueOperators = pipelineValueOperators.exclude([
  "between",
])
export type PipelineSingleValueOperator = z.infer<
  typeof pipelineSingleValueOperators
>

export const isSingleValueOperator = (
  operator: string | undefined,
): operator is PipelineSingleValueOperator =>
  pipelineSingleValueOperators.safeParse(operator).success

/**
 * One operator vocabulary for every custom-field filter (board, API, SQL). What
 * an operator compares depends on the field's comparison kind: text compares
 * case-insensitively (`is`/`isNot` exactly), numbers numerically, dates by
 * calendar day in a timezone, booleans by `true`/`false`. `hasValue`/`noValue`
 * test presence (a missing key or an empty string is "no value").
 */
export const pipelineFieldOperators = z.enum([
  "is",
  "isNot",
  "hasValue",
  "noValue",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "gt",
  "lt",
  "between",
])
export type PipelineFieldOperator = z.infer<typeof pipelineFieldOperators>

/**
 * How a field type's stored value compares. `date` stores a picked day, so it
 * compares as written; `datetime` stores an instant, compared by its day in the
 * filter's timezone.
 */
export type PipelineFieldComparisonKind =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"

export const PIPELINE_FIELD_COMPARISON_KIND: Record<
  CustomFieldType,
  PipelineFieldComparisonKind
> = {
  shortText: "text",
  longText: "text",
  email: "text",
  phoneNumber: "text",
  number: "number",
  date: "date",
  datetime: "datetime",
  boolean: "boolean",
}

const TEXT_FIELD_OPERATORS = [
  "is",
  "isNot",
  "hasValue",
  "noValue",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
] as const satisfies readonly PipelineFieldOperator[]

const ORDERED_FIELD_OPERATORS = [
  "is",
  "isNot",
  "hasValue",
  "noValue",
  "gt",
  "lt",
  "between",
] as const satisfies readonly PipelineFieldOperator[]

const BOOLEAN_FIELD_OPERATORS = [
  "is",
  "isNot",
  "hasValue",
  "noValue",
] as const satisfies readonly PipelineFieldOperator[]

/** Operators each field type offers, in display order. */
export const PIPELINE_FIELD_OPERATORS_BY_TYPE: Record<
  CustomFieldType,
  readonly PipelineFieldOperator[]
> = {
  shortText: TEXT_FIELD_OPERATORS,
  longText: TEXT_FIELD_OPERATORS,
  email: TEXT_FIELD_OPERATORS,
  phoneNumber: TEXT_FIELD_OPERATORS,
  number: ORDERED_FIELD_OPERATORS,
  date: ORDERED_FIELD_OPERATORS,
  datetime: ORDERED_FIELD_OPERATORS,
  boolean: BOOLEAN_FIELD_OPERATORS,
}

/** Operators that take no operand. */
export const PIPELINE_FIELD_PRESENCE_OPERATORS: readonly PipelineFieldOperator[] =
  ["hasValue", "noValue"]

export const pipelineActivityKinds = z.enum([
  "created",
  "stageChanged",
  "statusChanged",
  "valueChanged",
  "priorityChanged",
  "dueDateChanged",
  "titleChanged",
  "descriptionChanged",
  "fieldValuesChanged",
  "assigneesChanged",
  "attachmentAdded",
  "attachmentRemoved",
  "commentAdded",
  "commentDeleted",
  "transferred",
  "deleted",
])
export type PipelineActivityKind = z.infer<typeof pipelineActivityKinds>

/** What the item drawer's activity filter offers; each group covers one or more kinds. */
export const pipelineActivityGroups = z.enum([
  "lifecycle",
  "stage",
  "status",
  "value",
  "priority",
  "dueDate",
  "details",
  "assignees",
  "comments",
  "attachments",
])
export type PipelineActivityGroup = z.infer<typeof pipelineActivityGroups>

export const PIPELINE_ACTIVITY_KINDS_BY_GROUP: Record<
  PipelineActivityGroup,
  readonly PipelineActivityKind[]
> = {
  lifecycle: ["created", "transferred", "deleted"],
  stage: ["stageChanged"],
  status: ["statusChanged"],
  value: ["valueChanged"],
  priority: ["priorityChanged"],
  dueDate: ["dueDateChanged"],
  details: ["titleChanged", "descriptionChanged", "fieldValuesChanged"],
  assignees: ["assigneesChanged"],
  comments: ["commentAdded", "commentDeleted"],
  attachments: ["attachmentAdded", "attachmentRemoved"],
}

/** The kinds of the given groups; undefined (no filter) when none is given. */
export const activityKindsOf = (
  groups: readonly PipelineActivityGroup[] | undefined,
): PipelineActivityKind[] | undefined =>
  groups && groups.length > 0
    ? [
        ...new Set(
          groups.flatMap((group) => PIPELINE_ACTIVITY_KINDS_BY_GROUP[group]),
        ),
      ]
    : undefined

export const pipelineActorKinds = z.enum([
  "user",
  "workspaceToken",
  "flow",
  "trigger",
  "system",
])
export type PipelineActorKind = z.infer<typeof pipelineActorKinds>

/** Stable machine name used by `{{pipelines.<reference_name>.*}}` variables. */
export const PIPELINE_REFERENCE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
export const pipelineReferenceNameSchema = z
  .string()
  .regex(PIPELINE_REFERENCE_NAME_PATTERN)

export const PIPELINE_REFERENCE_NAME_MAX = 64
const NON_REFERENCE_CHARS = /[^a-z0-9]+/g
const EDGE_UNDERSCORES = /^_+|_+$/g
const STARTS_WITH_LETTER = /^[a-z]/

/**
 * Stable machine name derived from a display name: lower-case, `[a-z0-9_]`,
 * starting with a letter. Diacritics are folded so "Đàm phán" -> "dam_phan".
 * Shared by the server (allocation) and the settings UI (suggestion).
 */
export function referenceNameFromName(name: string, fallback: string): string {
  const base = normalizeForMatch(name)
    .replace(NON_REFERENCE_CHARS, "_")
    .replace(EDGE_UNDERSCORES, "")
  const prefixed = STARTS_WITH_LETTER.test(base) ? base : `${fallback}_${base}`
  return prefixed
    .replace(EDGE_UNDERSCORES, "")
    .slice(0, PIPELINE_REFERENCE_NAME_MAX)
}

/**
 * `value` of a pipeline-item trigger condition. Only moved-to-stage conditions
 * write it (`stageId` pins the destination stage); the others store nothing.
 */
export const pipelineConditionValueSchema = z.object({ stageId: z.string() })

/** Dates Postgres `timestamptz` handles without a range error (22008). */
export const PIPELINE_DATE_RANGE = {
  min: new Date("1900-01-01T00:00:00Z"),
  max: new Date("2200-01-01T00:00:00Z"),
} as const

/** Whether a date can be stored or compared (a year-0000 date cannot). */
export const isWithinPipelineDateRange = (date: Date): boolean =>
  date >= PIPELINE_DATE_RANGE.min && date <= PIPELINE_DATE_RANGE.max

export const PIPELINE_LIMITS = {
  name: 120,
  title: 200,
  description: 5000,
  comment: 2000,
  stageDescription: 300,
  idempotencyKey: 128,
  colorPattern: /^#[0-9a-f]{6}$/i,
  currencyPattern: /^[A-Z]{3}$/,
  /** Stage move/delete above this many items runs as a queued job. */
  bulkSyncItems: 2000,
  /** Rows touched per transaction by the queued stage job. */
  bulkBatchSize: 500,
  assigneesPerItem: 20,
  /** `numeric(19, 4)` holds 15 integer digits; larger values overflow in Postgres. */
  itemValue: 999_999_999_999_999,
  /** Stages one pipeline may hold; also the cap on stage-id arrays in requests. */
  stagesPerPipeline: 200,
} as const

const trimmedLabel = (fallback: string) =>
  z.string().trim().min(1).max(40).default(fallback)

export const pipelineSettingsSchema = z.object({
  version: z.literal(1).default(1),
  assignContactOnAssign: z.boolean().default(false),
  maxOpenItemsPerContact: z
    .number()
    .int()
    .min(1)
    .max(100)
    .nullable()
    .default(null),
  visibleFeatures: z
    .object({
      priority: z.boolean().default(true),
      value: z.boolean().default(true),
      dueDate: z.boolean().default(true),
    })
    .default({ priority: true, value: true, dueDate: true }),
  cardElements: z
    .object({
      contactPhone: z.boolean().default(false),
      contactEmail: z.boolean().default(false),
      createdAt: z.boolean().default(true),
      updatedAt: z.boolean().default(false),
      assignees: z.boolean().default(true),
      comments: z.boolean().default(true),
      cardId: z.boolean().default(true),
      priority: z.boolean().default(true),
      value: z.boolean().default(true),
      dueDate: z.boolean().default(true),
    })
    .default({
      contactPhone: false,
      contactEmail: false,
      createdAt: true,
      updatedAt: false,
      assignees: true,
      comments: true,
      cardId: true,
      priority: true,
      value: true,
      dueDate: true,
    }),
  statusLabels: z
    .object({
      open: trimmedLabel("Open"),
      won: trimmedLabel("Won"),
      lost: trimmedLabel("Lost"),
    })
    .default({ open: "Open", won: "Won", lost: "Lost" }),
})
export type PipelineSettings = z.infer<typeof pipelineSettingsSchema>

/** `nounKey` selects the i18n noun the UI uses for an item of that type. */
export const pipelineTypeDefaults: Record<
  PipelineType,
  {
    firstStageName: string
    statusLabels: PipelineSettings["statusLabels"]
    nounKey: "opportunity" | "ticket" | "card"
  }
> = {
  opportunity: {
    firstStageName: "Lead",
    statusLabels: { open: "Open", won: "Won", lost: "Lost" },
    nounKey: "opportunity",
  },
  ticket: {
    firstStageName: "New Issue",
    statusLabels: { open: "Open", won: "Resolved", lost: "Not Resolved" },
    nounKey: "ticket",
  },
  custom: {
    firstStageName: "Intake",
    statusLabels: { open: "Open", won: "Resolved", lost: "Not Resolved" },
    nounKey: "card",
  },
}

/**
 * A settings change as callers send it: every group and key optional with no
 * defaults, so an untouched group is never reset. Merged over the stored
 * settings by {@link mergePipelineSettings}.
 */
export const pipelineSettingsPatchSchema = z.object({
  assignContactOnAssign: z.boolean().optional(),
  maxOpenItemsPerContact: z
    .number()
    .int()
    .min(1)
    .max(100)
    .nullable()
    .optional(),
  visibleFeatures: z
    .object({
      priority: z.boolean().optional(),
      value: z.boolean().optional(),
      dueDate: z.boolean().optional(),
    })
    .optional(),
  cardElements: z
    .object({
      contactPhone: z.boolean().optional(),
      contactEmail: z.boolean().optional(),
      createdAt: z.boolean().optional(),
      updatedAt: z.boolean().optional(),
      assignees: z.boolean().optional(),
      comments: z.boolean().optional(),
      cardId: z.boolean().optional(),
      priority: z.boolean().optional(),
      value: z.boolean().optional(),
      dueDate: z.boolean().optional(),
    })
    .optional(),
  statusLabels: z
    .object({
      open: z.string().trim().min(1).max(40).optional(),
      won: z.string().trim().min(1).max(40).optional(),
      lost: z.string().trim().min(1).max(40).optional(),
    })
    .optional(),
})
export type PipelineSettingsPatch = z.infer<typeof pipelineSettingsPatchSchema>

/** Applies a patch group by group and key by key; untouched values stay as stored. */
export function mergePipelineSettings(
  current: PipelineSettings,
  patch: PipelineSettingsPatch,
): PipelineSettings {
  return pipelineSettingsSchema.parse({
    ...current,
    ...(patch.assignContactOnAssign === undefined
      ? {}
      : { assignContactOnAssign: patch.assignContactOnAssign }),
    ...(patch.maxOpenItemsPerContact === undefined
      ? {}
      : { maxOpenItemsPerContact: patch.maxOpenItemsPerContact }),
    visibleFeatures: { ...current.visibleFeatures, ...patch.visibleFeatures },
    cardElements: { ...current.cardElements, ...patch.cardElements },
    statusLabels: { ...current.statusLabels, ...patch.statusLabels },
  })
}

/** A custom-field filter operand: `value` (`between`: lower) and `valueTo` (upper). */
export type PipelineFieldConditionInput = {
  operator: PipelineFieldOperator
  value?: string
  valueTo?: string
}

const NUMERIC_OPERAND_PATTERN = /^-?\d{1,30}(\.\d{1,30})?$/
const DAY_OPERAND_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether `text` is a real calendar day written `YYYY-MM-DD`. */
export const isPipelineFilterDay = (
  text: string | undefined,
): text is string => {
  const match = text === undefined ? null : DAY_OPERAND_PATTERN.exec(text)
  if (!(text && match)) {
    return false
  }
  const date = new Date(`${text}T00:00:00Z`)
  // Postgres has no year 0000, so it is rejected here rather than in SQL.
  return (
    Number(match[1]) >= 1 &&
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  )
}

/** Whether `text` is a plain decimal number string. */
export const isPipelineFilterNumber = (
  text: string | undefined,
): text is string => text !== undefined && NUMERIC_OPERAND_PATTERN.test(text)

const OPERAND_CHECKS: Record<
  PipelineFieldComparisonKind,
  { valid: (text: string) => boolean; expected: string }
> = {
  text: { valid: (text) => text !== "", expected: "a non-empty text" },
  number: { valid: isPipelineFilterNumber, expected: "a number" },
  date: { valid: isPipelineFilterDay, expected: "a date as YYYY-MM-DD" },
  datetime: { valid: isPipelineFilterDay, expected: "a date as YYYY-MM-DD" },
  boolean: {
    valid: (text) => text === "true" || text === "false",
    expected: '"true" or "false"',
  },
}

/**
 * Why a condition cannot run on a field of `type` (operator not offered, or an
 * operand missing/malformed), or `undefined` when it is valid. One rule set for
 * the service (422) and the public API.
 */
export function pipelineFieldConditionError(
  type: CustomFieldType,
  condition: PipelineFieldConditionInput,
): string | undefined {
  const { operator, value, valueTo } = condition
  if (!PIPELINE_FIELD_OPERATORS_BY_TYPE[type].includes(operator)) {
    return `Operator ${operator} is not available for ${type} fields`
  }
  if (PIPELINE_FIELD_PRESENCE_OPERATORS.includes(operator)) {
    return
  }
  const check = OPERAND_CHECKS[PIPELINE_FIELD_COMPARISON_KIND[type]]
  const operandError = (name: string, text: string | undefined) =>
    text === undefined || text === "" || !check.valid(text)
      ? `Operator ${operator} needs ${name} as ${check.expected}`
      : undefined
  if (operator !== "between") {
    return operandError("value", value)
  }
  if (value === undefined && valueTo === undefined) {
    return "Operator between needs value, valueTo or both"
  }
  return (
    (value === undefined ? undefined : operandError("value", value)) ??
    (valueTo === undefined ? undefined : operandError("valueTo", valueTo))
  )
}
