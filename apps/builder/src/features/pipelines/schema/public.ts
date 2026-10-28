import {
  isSingleValueOperator,
  PIPELINE_FIELD_PRESENCE_OPERATORS,
  PIPELINE_LIMITS,
  pipelineActivityGroups,
  pipelineFieldOperators,
  pipelineItemPriorities,
  pipelineItemSortKeys,
  pipelineItemStatuses,
  pipelineReferenceNameSchema,
  pipelineSettingsPatchSchema,
  pipelineTypes,
  pipelineValueOperators,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { z } from "zod"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { ianaTimezoneSchema } from "@/lib/public-api/iana-timezone"
import {
  boundedDate,
  hasNoNul,
  MAX_FIELD_VALUE_LENGTH,
  MAX_FIELD_VALUES,
  NO_NUL_MESSAGE,
  statsRangeFields,
} from "./bounds"
import { pipelineItemFilterRequest } from "./query"
import {
  itemId,
  pipelineId,
  publicPipelineActivityResource,
  publicPipelineCommentResource,
  publicPipelineItemResource,
  stageId,
} from "./resource"

const colorSchema = z
  .string()
  .regex(PIPELINE_LIMITS.colorPattern, "Use a #rrggbb hex color")
  .nullable()

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PIPELINE_LIMITS.name)
  .refine(hasNoNul, NO_NUL_MESSAGE)
  .describe("Display name, up to 120 characters.")

const itemTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(PIPELINE_LIMITS.title)
  .refine(hasNoNul, NO_NUL_MESSAGE)
  .describe("Item title, up to 200 characters.")

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(PIPELINE_LIMITS.idempotencyKey)
  .refine(hasNoNul, NO_NUL_MESSAGE)

export const pipelineIdRequest = z.object({ id: pipelineId })
export const pipelineStageRequest = z.object({
  id: pipelineId,
  stageId,
})
export const pipelineItemRequest = z.object({
  id: pipelineId,
  itemId,
})

// Pipeline requests --------------------------------------------------------------

export const createPipelinePublicRequest = z.object({
  type: pipelineTypes.describe(
    "`opportunity` (first stage Lead, items are opportunities), `ticket` (first stage New Issue) or `custom` (first stage Intake).",
  ),
  name: nameSchema,
})

export const updatePipelinePublicRequest = pipelineIdRequest.extend({
  name: nameSchema.optional(),
  referenceName: pipelineReferenceNameSchema
    .optional()
    .describe(
      "Lowercase letters, digits and underscores, starting with a letter. Changing it breaks `{{pipelines.<old>.*}}` variables already used in messages.",
    ),
  currency: z
    .string()
    .regex(PIPELINE_LIMITS.currencyPattern, "Use a 3-letter ISO 4217 code")
    .nullable()
    .optional()
    .describe(
      "ISO 4217 currency code item values are in, e.g. `USD`. Null makes the pipeline follow the workspace default again (the currency of the workspace target country from `workspaces.update`, else USD).",
    ),
  settings: pipelineSettingsPatchSchema
    .optional()
    .describe(
      "Send only the settings to change; every group and key you leave out keeps its stored value.",
    ),
})

// Stages -------------------------------------------------------------------------

const stageValues = z.object({
  name: nameSchema.optional(),
  description: z
    .string()
    .max(PIPELINE_LIMITS.stageDescription)
    .refine(hasNoNul, NO_NUL_MESSAGE)
    .nullable()
    .optional()
    .describe("Stage description, up to 300 characters. Null clears it."),
  textColor: colorSchema
    .optional()
    .describe("Column header text color as `#rrggbb`. Null resets it."),
  backgroundColor: colorSchema
    .optional()
    .describe("Column header background color as `#rrggbb`. Null resets it."),
})

export const createStagePublicRequest = pipelineIdRequest.extend({
  name: nameSchema,
  description: stageValues.shape.description,
  textColor: stageValues.shape.textColor,
  backgroundColor: stageValues.shape.backgroundColor,
})

export const updateStagePublicRequest = pipelineStageRequest.extend(
  stageValues.shape,
)

export const deleteStagePublicRequest = pipelineStageRequest.extend({
  moveItemsToStageId: zodBigintIdAsString()
    .optional()
    .describe(
      "Move the stage's items to this other stage of the pipeline first (ids from `pipelines.get`). Omit to delete the items with the stage.",
    ),
})

export const deleteStagePublicResponse = z.object({
  queued: z
    .boolean()
    .describe(
      "True when the stage held more than 2000 items and is being processed in the background; the stage reports `processing` until it is gone.",
    ),
  jobId: z.string().nullable(),
})

export const reorderStagesPublicRequest = pipelineIdRequest.extend({
  stageIds: z
    .array(zodBigintIdAsString())
    .min(1)
    .max(PIPELINE_LIMITS.stagesPerPipeline)
    .describe(
      "Every stage id of the pipeline, in the new left-to-right order.",
    ),
})

// Fields -------------------------------------------------------------------------

export const createFieldPublicRequest = pipelineIdRequest.extend({
  name: nameSchema,
  referenceName: pipelineReferenceNameSchema.describe(
    "Stable machine name: lowercase letters, digits and underscores, starting with a letter. Unique within the pipeline.",
  ),
  type: customFieldTypes.describe("Field type; it cannot be changed later."),
  required: z
    .boolean()
    .default(false)
    .describe("When true every item must have a value for this field."),
})

export const updateFieldPublicRequest = pipelineIdRequest.extend({
  fieldId: zodBigintIdAsString().describe(
    "Field id. Get it from `pipelines.get` (`fields[].id`).",
  ),
  name: nameSchema.optional(),
  referenceName: pipelineReferenceNameSchema
    .optional()
    .describe("New stable machine name, unique within the pipeline."),
  required: z
    .boolean()
    .optional()
    .describe("Whether every item must have a value for this field."),
})

export const deleteFieldPublicRequest = pipelineIdRequest.extend({
  fieldId: updateFieldPublicRequest.shape.fieldId,
})

// Members ------------------------------------------------------------------------

export const setMemberPublicRequest = pipelineIdRequest.extend({
  workspaceMemberId: zodBigintIdAsString().describe(
    "Workspace member id. Get it from `workspaceMembers.list`.",
  ),
  canView: z.boolean().describe("May open the pipeline and read its items."),
  canEdit: z
    .boolean()
    .default(false)
    .describe("May create, change and move items. Implies view."),
  canDelete: z
    .boolean()
    .default(false)
    .describe("May delete items. Implies view."),
  canManageSettings: z
    .boolean()
    .default(false)
    .describe(
      "May change stages, fields, settings and permissions. Implies view.",
    ),
})

export const removeMemberPublicRequest = pipelineIdRequest.extend({
  workspaceMemberId: setMemberPublicRequest.shape.workspaceMemberId,
})

// Items --------------------------------------------------------------------------

const itemWriteFields = {
  description: z
    .string()
    .max(PIPELINE_LIMITS.description)
    .refine(hasNoNul, NO_NUL_MESSAGE)
    .nullable()
    .optional()
    .describe("Plain-text description, up to 5000 characters. Null clears it."),
  value: z
    .number()
    .finite()
    .min(0)
    .max(PIPELINE_LIMITS.itemValue)
    .nullable()
    .optional()
    .describe("Amount in the pipeline currency. Null clears it."),
  priority: pipelineItemPriorities
    .optional()
    .describe("`low`, `medium` or `high`. New items default to `medium`."),
  status: pipelineItemStatuses
    .optional()
    .describe(
      "`open`, `won` or `lost`. Won/lost closes the item; `open` reopens it.",
    ),
  dueDate: boundedDate()
    .nullable()
    .optional()
    .describe("Due date and time (ISO 8601). Null clears it."),
  stageId: zodBigintIdAsString()
    .optional()
    .describe(
      "Stage of this pipeline, from `pipelines.get` (`stages[].id`). Defaults to the first stage.",
    ),
  assigneeMemberIds: z
    .array(zodBigintIdAsString())
    .max(PIPELINE_LIMITS.assigneesPerItem)
    .optional()
    .describe("Workspace member ids from `workspaceMembers.list`."),
  assigneeInboxTeamIds: z
    .array(zodBigintIdAsString())
    .max(PIPELINE_LIMITS.assigneesPerItem)
    .optional()
    .describe("Inbox team ids from `inboxTeams.list`."),
  fieldValues: z
    .record(
      zodBigintIdAsString(),
      z
        .string()
        .max(MAX_FIELD_VALUE_LENGTH)
        .refine(hasNoNul, NO_NUL_MESSAGE)
        .nullable(),
    )
    .refine((values) => Object.keys(values).length <= MAX_FIELD_VALUES, {
      message: "Too many field values",
    })
    .optional()
    .describe(
      "Custom field values keyed by pipeline field id (`pipelines.get` → `fields[].id`). `null` clears a field.",
    ),
  fieldValuesTimezone: ianaTimezoneSchema
    .max(64)
    .optional()
    .describe(
      "Valid IANA timezone (e.g. `Asia/Ho_Chi_Minh`) that anchors `date` custom-field values sent in `fieldValues`; an unknown zone is rejected with 422. Defaults to the contact's, then the workspace's, timezone.",
    ),
}

export const createItemPublicRequest = pipelineIdRequest.extend({
  contactId: zodBigintIdAsString().describe(
    "Contact the item belongs to. Get it from `contacts.list`.",
  ),
  title: itemTitleSchema,
  ...itemWriteFields,
  mediaLibraryFileIds: z
    .array(zodBigintIdAsString())
    .max(20)
    .optional()
    .describe(
      "Files to attach, from `mediaLibrary.createFile` (needs the `media` scope as well).",
    ),
  idempotencyKey: idempotencyKeySchema
    .optional()
    .describe(
      "Repeating a request with the same key returns the first item instead of creating another. Reusing a key for a different contact is a 409.",
    ),
})

export const updateItemPublicRequest = pipelineItemRequest.extend({
  title: itemTitleSchema.optional(),
  ...itemWriteFields,
})

export const moveItemPublicRequest = pipelineItemRequest.extend({
  stageId,
})

export const transferItemPublicRequest = pipelineItemRequest.extend({
  destinationPipelineId: zodBigintIdAsString().describe(
    "Pipeline to move the item to. Get it from `pipelines.list`.",
  ),
  destinationStageId: zodBigintIdAsString()
    .optional()
    .describe(
      "Stage of the destination pipeline, from `pipelines.get` called with `destinationPipelineId`. Defaults to its first stage.",
    ),
})

/** `<prefix>From` / `<prefix>To` ISO date-time filters sharing one description pattern. */
const rangeParams = <P extends string>(prefix: P, phrase: string) =>
  ({
    [`${prefix}From`]: boundedDate()
      .optional()
      .describe(
        `Only items ${phrase} at or after this ISO date-time. Combine with \`${prefix}To\` for a range.`,
      ),
    [`${prefix}To`]: boundedDate()
      .optional()
      .describe(
        `Only items ${phrase} at or before this ISO date-time. Combine with \`${prefix}From\` for a range.`,
      ),
  }) as Record<
    `${P}From` | `${P}To`,
    z.ZodOptional<ReturnType<typeof boundedDate>>
  >

const operandText = z
  .string()
  .max(MAX_FIELD_VALUE_LENGTH)
  .refine(hasNoNul, NO_NUL_MESSAGE)

const commaSeparated = (value: unknown) => {
  if (typeof value !== "string") {
    return value
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

/** A query list given comma-separated (or as an array by MCP clients). */
const commaList = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess(commaSeparated, z.array(item).max(max).optional())

const MAX_ASSIGNEE_FILTER_IDS = 100

/** A JSON object in a query string (or the object itself from MCP clients). */
const jsonObject = (value: unknown) => {
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    // Left as the string: the object schema then rejects it with a 422.
    return value
  }
}

const MAX_ACTIVITY_ACTORS = 100

const activityActorSchema = z.union([
  z.literal("automation"),
  zodBigintIdAsString(),
])

/** Filters shared by `listItems` and `stageTotals`; lists are comma-separated, "any of". */
const itemFilterQuery = pipelineIdRequest.extend({
  stageId: commaList(
    zodBigintIdAsString(),
    PIPELINE_LIMITS.stagesPerPipeline,
  ).describe(
    "Comma-separated stage ids: items in any of them. Get them from `pipelines.get`.",
  ),
  contactId: zodBigintIdAsString()
    .optional()
    .describe("Only this contact's items. Get it from `contacts.list`."),
  status: commaList(
    pipelineItemStatuses,
    pipelineItemStatuses.options.length,
  ).describe("Comma-separated statuses (`open`, `won`, `lost`): any of them."),
  priority: commaList(
    pipelineItemPriorities,
    pipelineItemPriorities.options.length,
  ).describe(
    "Comma-separated priorities (`low`, `medium`, `high`): any of them.",
  ),
  assigneeMemberId: commaList(
    zodBigintIdAsString(),
    MAX_ASSIGNEE_FILTER_IDS,
  ).describe(
    "Comma-separated workspace member ids: items assigned to any of them. Get ids from `workspaceMembers.list`.",
  ),
  assigneeInboxTeamId: commaList(
    zodBigintIdAsString(),
    MAX_ASSIGNEE_FILTER_IDS,
  ).describe(
    "Comma-separated inbox team ids: items assigned to any of them. Get ids from `inboxTeams.list`.",
  ),
  search: z
    .string()
    .trim()
    .max(200)
    .refine(hasNoNul, NO_NUL_MESSAGE)
    .optional()
    .describe(
      "Matches the title, item number, or the contact's name/email/phone.",
    ),
  valueOperator: pipelineValueOperators
    .optional()
    .describe(
      "How to compare the item value: `eq`, `gt`, `lt` and `ne` use `valueAmount` (`ne` also matches items without a value); `between` uses `valueMin`/`valueMax`. Omit it to filter by `valueMin`/`valueMax` alone.",
    ),
  valueAmount: z.coerce
    .number()
    .optional()
    .describe("Amount `valueOperator` `eq`/`gt`/`lt`/`ne` compares against."),
  valueMin: z.coerce
    .number()
    .optional()
    .describe("Only items worth at least this much."),
  valueMax: z.coerce
    .number()
    .optional()
    .describe("Only items worth at most this much."),
  dueFrom: boundedDate().optional().describe("Due at or after this time."),
  dueTo: boundedDate().optional().describe("Due at or before this time."),
  createdFrom: boundedDate()
    .optional()
    .describe("Created at or after this time."),
  createdTo: boundedDate()
    .optional()
    .describe("Created at or before this time."),
  ...rangeParams("updated", "last updated"),
  ...rangeParams("lastComment", "whose latest comment was written"),
  ...rangeParams("statusChanged", "whose status last changed"),
  ...rangeParams("stageEntered", "that entered their current stage"),
  ...rangeParams("wonClosed", "now `won` whose closure happened"),
  ...rangeParams("lostClosed", "now `lost` whose closure happened"),
  activityGroups: z
    .preprocess(
      commaSeparated,
      z
        .array(pipelineActivityGroups)
        .max(pipelineActivityGroups.options.length)
        .optional(),
    )
    .describe(
      "Comma-separated kinds of change: only items with an activity entry of one of them. `lifecycle` = created/transferred/deleted, `stage`, `status`, `value`, `priority`, `dueDate`, `details` = title/description/custom fields, `assignees`, `comments`, `attachments`. Combined with `activityActor` and `activityFrom`/`activityTo`, one single entry must satisfy all of them. Only activity recorded in this pipeline counts.",
    ),
  activityActor: z
    .preprocess(
      commaSeparated,
      z.array(activityActorSchema).max(MAX_ACTIVITY_ACTORS).optional(),
    )
    .describe(
      "Comma-separated actors: only items with an activity entry done by one of them. Each is a workspace user id (the `userId` of `workspaceMembers.list`, not the member id) or `automation` for flows, triggers, API tokens and the system. Same single-entry rule as `activityGroups`.",
    ),
  ...rangeParams("activity", "with an activity entry"),
  fieldConditions: z
    .preprocess(jsonObject, pipelineItemFilterRequest.shape.fieldConditions)
    .describe(
      'Several custom-field conditions, all required (AND): a JSON object keyed by field id, e.g. `{"123":{"operator":"gt","value":"5"},"124":{"operator":"is","value":"VIP"}}`. Operators and operands as for `fieldOperator`. Combined with `fieldId`/`fieldOperator`, which adds one more.',
    ),
  fieldId: zodBigintIdAsString()
    .optional()
    .describe(
      "Custom field id to filter on; pair it with `fieldOperator` and its operands (`fieldValue`, `fieldValueTo`). Get ids from `pipelines.get`.",
    ),
  fieldOperator: pipelineFieldOperators
    .optional()
    .describe(
      "How custom field `fieldId` is compared. Allowed per field type — text, long text, email, phone: `is`, `isNot`, `hasValue`, `noValue`, `contains`, `notContains`, `startsWith`, `endsWith`; number, date, datetime: `is`, `isNot`, `hasValue`, `noValue`, `gt`, `lt`, `between`; boolean: `is`, `isNot`, `hasValue`, `noValue`. `hasValue`/`noValue` take no operand. `isNot` and `notContains` only match items that have a value. A date compares its stored day as written; a datetime compares its calendar day in `timezone`. An operator the field's type does not offer is rejected with 422.",
    ),
  fieldValue: operandText
    .optional()
    .describe(
      "Operand of `fieldOperator`: text for text fields, a number such as `42.5` for number fields, a day `YYYY-MM-DD` for date and datetime fields, `true` or `false` for boolean fields. For `between` it is the lower bound (omit for an open lower bound).",
    ),
  fieldValueTo: operandText
    .optional()
    .describe(
      "Upper bound of `fieldOperator` `between` (same format as `fieldValue`, inclusive; omit for an open upper bound).",
    ),
  timezone: statsRangeFields.timezone.describe(
    "IANA timezone (e.g. `Asia/Ho_Chi_Minh`) whose calendar days datetime custom-field conditions compare in (date fields ignore it). Defaults to the workspace timezone.",
  ),
})

type ItemFilterQuery = z.infer<typeof itemFilterQuery>

/** Rejects a comparison without its operand instead of silently dropping it. */
function refineItemFilter(input: ItemFilterQuery, context: z.RefinementCtx) {
  if (
    isSingleValueOperator(input.valueOperator) &&
    input.valueAmount === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["valueAmount"],
      message: `valueOperator ${input.valueOperator} needs valueAmount`,
    })
  }
  if (
    input.valueOperator === "between" &&
    input.valueMin === undefined &&
    input.valueMax === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["valueMin"],
      message: "valueOperator between needs valueMin, valueMax or both",
    })
  }
  if (input.fieldOperator === undefined) {
    return
  }
  if (input.fieldId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["fieldId"],
      message: "fieldOperator needs fieldId",
    })
  }
  // Operand format depends on the field's type, which the service checks (422).
  const hasValue = input.fieldValue !== undefined && input.fieldValue !== ""
  const hasValueTo =
    input.fieldValueTo !== undefined && input.fieldValueTo !== ""
  const lacksOperand =
    input.fieldOperator === "between"
      ? !(hasValue || hasValueTo)
      : !(
          hasValue ||
          PIPELINE_FIELD_PRESENCE_OPERATORS.includes(input.fieldOperator)
        )
  if (lacksOperand) {
    context.addIssue({
      code: "custom",
      path: ["fieldValue"],
      message: `fieldOperator ${input.fieldOperator} needs ${input.fieldOperator === "between" ? "fieldValue or fieldValueTo" : "fieldValue"}`,
    })
  }
}

export const listItemsPublicRequest = itemFilterQuery
  .extend({
    sort: pipelineItemSortKeys
      .default("createdAt")
      .describe("Sort key. Items without a value for it come last."),
    direction: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("Sort direction."),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe("Page size, 1-100."),
    cursor: z
      .string()
      .optional()
      .describe(
        "`nextCursor` of the previous page. Keep sort and filters unchanged.",
      ),
  })
  .superRefine(refineItemFilter)

export const stageTotalsPublicRequest =
  itemFilterQuery.superRefine(refineItemFilter)

export const stageTotalsPublicResponse = z.object({
  stages: z.array(
    z.object({
      stageId: z.string(),
      name: z.string(),
      count: z.number().describe("Items in the stage that match the filters."),
      totalValue: z
        .number()
        .describe("Sum of those items' values, in the pipeline currency."),
    }),
  ),
})

export const listCommentsPublicRequest = pipelineItemRequest.extend({
  cursor: z
    .string()
    .optional()
    .describe("`nextCursor` of the previous page, for older comments."),
})

export const listCommentsPublicResponse = z.object({
  items: z.array(publicPipelineCommentResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next (older) page; null on the last."),
})

export const listActivityPublicRequest = pipelineItemRequest.extend({
  cursor: z
    .string()
    .optional()
    .describe(
      "`nextCursor` of the previous page, for older activity. Keep `groups` unchanged.",
    ),
  groups: z
    .preprocess(
      commaSeparated,
      z
        .array(pipelineActivityGroups)
        .max(pipelineActivityGroups.options.length)
        .optional(),
    )
    .describe(
      "Comma-separated kinds of change to return; all when omitted. `lifecycle` = created/transferred/deleted, `stage`, `status`, `value`, `priority`, `dueDate`, `details` = title/description/custom fields, `assignees`, `comments`, `attachments`.",
    ),
})

export const listActivityPublicResponse = z.object({
  items: z.array(publicPipelineActivityResource),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next (older) page; null on the last."),
})

export const listItemsPublicResponse = z.object({
  items: z.array(publicPipelineItemResource),
  nextCursor: z.string().nullable(),
})

export const addCommentPublicRequest = pipelineItemRequest.extend({
  text: z
    .string()
    .trim()
    .min(1)
    .max(PIPELINE_LIMITS.comment)
    .refine(hasNoNul, NO_NUL_MESSAGE)
    .describe("Comment text, up to 2000 characters."),
  idempotencyKey: idempotencyKeySchema
    .optional()
    .describe(
      "Repeating a request with the same key returns the first comment instead of adding another.",
    ),
})

export const deleteCommentPublicRequest = pipelineItemRequest.extend({
  commentId: zodBigintIdAsString().describe(
    "Comment id. Get it from `pipelines.listComments`.",
  ),
})

export const addAttachmentPublicRequest = pipelineItemRequest.extend({
  mediaLibraryFileId: zodBigintIdAsString().describe(
    "Media-library file id. Upload with `mediaLibrary.createUploadUrl` then `mediaLibrary.createFile` (needs the `media` scope as well as `pipelines`).",
  ),
})

export const removeAttachmentPublicRequest = pipelineItemRequest.extend({
  mediaLibraryFileId: zodBigintIdAsString().describe(
    "Media-library file id of the attachment, from `pipelines.getItem`.",
  ),
})

// Contact items & stats ------------------------------------------------------------

export const listContactItemsPublicRequest = z.object({
  identifier: publicContactIdentifier,
})

export const listContactItemsPublicResponse = z.object({
  items: z.array(
    publicPipelineItemResource.extend({
      pipelineName: z.string(),
      pipelineType: pipelineTypes,
    }),
  ),
})

export const pipelineStatsPublicRequest = pipelineIdRequest.extend({
  from: statsRangeFields.from.describe(
    "First day, `YYYY-MM-DD`, in the requested timezone.",
  ),
  to: statsRangeFields.to.describe("Last day, `YYYY-MM-DD`."),
  timezone: statsRangeFields.timezone.describe(
    "IANA timezone. Defaults to the workspace timezone.",
  ),
})

const statsTotals = z.object({
  created: z.number(),
  won: z.number(),
  wonValue: z.number(),
  lost: z.number(),
  lostValue: z.number(),
})

export const pipelineStatsPublicResponse = z.object({
  range: z.object({ from: z.string(), to: z.string(), timezone: z.string() }),
  current: statsTotals,
  previous: statsTotals,
  change: z
    .object({
      created: z.number().nullable(),
      won: z.number().nullable(),
      wonValue: z.number().nullable(),
      lost: z.number().nullable(),
      lostValue: z.number().nullable(),
    })
    .describe("Percent change against the previous period of the same length."),
  daily: z.array(statsTotals.extend({ day: z.string() })),
  byActor: z.array(
    statsTotals.extend({
      actorKind: z
        .enum(["user", "automation"])
        .describe(
          "`automation` groups flows, triggers, API tokens and system changes.",
        ),
      actorUserId: z
        .string()
        .nullable()
        .describe(
          "The user. Null for automation, or for a user that was deleted.",
        ),
    }),
  ),
})
