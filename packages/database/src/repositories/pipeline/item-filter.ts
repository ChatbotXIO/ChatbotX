import type { SQL } from "@chatbotx.io/database/client"
import {
  and,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  pipelineItemActivityModel,
  pipelineItemAssigneeModel,
  pipelineItemModel,
} from "@chatbotx.io/database/schema"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import {
  isSingleValueOperator,
  type PipelineActivityKind,
  type PipelineActorKind,
  type PipelineItemPriority,
  type PipelineItemStatus,
  type PipelineSingleValueOperator,
  type PipelineValueOperator,
  pipelineActivityKinds,
} from "../../partials/pipeline"
import { isBigintId, likeContains } from "../../utils"
import {
  fieldConditionSql,
  type PipelineFieldCondition,
} from "./field-condition"

const NUMERIC_SEARCH_PATTERN = /^#?\d+$/
// Same shapes the contacts keyword search uses: email only for an "@" input,
// phone only for a phone-like input with enough digits. A bare "9" must not
// match every email or synthetic guest identifier that contains a 9.
const EMAIL_SEARCH_PATTERN = /@/
const PHONE_SEARCH_PATTERN = /^[+\d\s\-()]+$/
const MIN_PHONE_SEARCH_DIGITS = 6

/**
 * Contact columns a board search looks at, by what the input looks like.
 * Email and phone are skipped for a caller who may not see them, so a search
 * cannot reveal them by matching.
 */
const contactSearchConditions = (
  search: string,
  includeEmailAndPhone: boolean,
): SQL[] => {
  const conditions = [ilike(contactModel.fullName, likeContains(search))]
  if (includeEmailAndPhone && EMAIL_SEARCH_PATTERN.test(search)) {
    conditions.push(ilike(contactModel.email, likeContains(search)))
  }
  const digits = search.replace(/\D/g, "")
  if (
    includeEmailAndPhone &&
    PHONE_SEARCH_PATTERN.test(search) &&
    digits.length >= MIN_PHONE_SEARCH_DIGITS
  ) {
    conditions.push(ilike(contactModel.phoneNumber, likeContains(digits)))
  }
  if (isBigintId(search)) {
    conditions.push(sql`${contactModel.id}::text = ${search}`)
  }
  return conditions
}
/** `and(...)` typed as always present, for building EXISTS subqueries. */
const allOf = (...conditions: Array<SQL | undefined>): SQL =>
  and(...conditions) ?? sql`true`

export type DateRange = { from?: Date; to?: Date }

/** Actor kinds that are not a person: flows, triggers, API tokens and the system. */
const AUTOMATION_ACTOR_KINDS = [
  "flow",
  "trigger",
  "workspaceToken",
  "system",
] as const satisfies readonly PipelineActorKind[]

export type PipelineActivityMatch = {
  kinds?: PipelineActivityKind[]
  /** Activity done by one of these users (`actorKind` user + `actorUserId`). */
  actorUserIds?: string[]
  /** Activity done by a flow, trigger, workspace token or the system. */
  automation?: boolean
  occurredAt?: DateRange
}

export type PipelineItemFilter = {
  stageIds?: string[]
  statuses?: PipelineItemStatus[]
  priorities?: PipelineItemPriority[]
  contactId?: string
  assigneeMemberIds?: string[]
  assigneeTeamIds?: string[]
  search?: string
  /** `false` keeps contact email and phone out of `search` (caller lacks the permission). */
  searchContactEmailAndPhone?: boolean
  /**
   * Without `operator` this is the `min`/`max` interval. `eq/gt/lt/ne` compare
   * against `amount` ("ne" also matches items with no value); `between` uses `min`/`max`.
   */
  value?: {
    min?: number
    max?: number
    operator?: PipelineValueOperator
    amount?: number
  }
  dueDate?: DateRange
  createdAt?: DateRange
  updatedAt?: DateRange
  /** Condition on a custom field's stored value, keyed by field id. */
  fieldConditions?: Record<string, PipelineFieldCondition>
  /**
   * IANA zone whose calendar days date-field conditions compare in; `UTC` when
   * absent or unknown (callers resolve the workspace zone before this point).
   */
  timezone?: string
  /**
   * Type of each field in `fieldConditions`, resolved by the service from the
   * pipeline's fields (the SQL depends on the comparison kind). A condition
   * without a type adds no filter.
   */
  fieldTypes?: Record<string, CustomFieldType>
  /** The item's own latest comment time ("last comment on"). */
  lastCommentAt?: DateRange
  /** The item's own latest status change time ("status changed on"). */
  statusChangedAt?: DateRange
  /** When the item entered its current stage ("stage changed on"). */
  stageEnteredAt?: DateRange
  /** Matches items that had an activity row of the given kind inside the range. */
  activity?: Partial<Record<PipelineActivityKind, DateRange>>
  /**
   * One activity row of the item, recorded in the item's own pipeline, that
   * satisfies every part set here (AND within the row; unset parts add
   * nothing). `actorUserIds` and `automation` are alternatives (OR) for who
   * did it.
   */
  activityMatch?: PipelineActivityMatch
  /** Items whose status last became `won`/`lost` (closure) inside the range. */
  closedAt?: DateRange
  /** Items currently in that closed status whose closure falls inside the range. */
  closedAs?: Partial<Record<"won" | "lost", DateRange>>
}

const rangeConditions = (column: AnyPgColumn, range?: DateRange) => {
  const conditions: SQL[] = []
  if (range?.from) {
    conditions.push(gte(column, range.from))
  }
  if (range?.to) {
    conditions.push(lte(column, range.to))
  }
  return conditions
}

/** Won and lost are alternatives: an item is in one status, so they are OR-ed. */
const closedAsCondition = (
  closedAs: PipelineItemFilter["closedAs"],
): SQL | undefined => {
  const branches = (["won", "lost"] as const).flatMap((status) => {
    const range = closedAs?.[status]
    return range
      ? [
          allOf(
            eq(pipelineItemModel.status, status),
            ...rangeConditions(pipelineItemModel.closedAt, range),
          ),
        ]
      : []
  })
  return branches.length > 0 ? or(...branches) : undefined
}

/** SQL of each single-amount value operator ("Different" also matches no value). */
const SINGLE_VALUE_CONDITION: Record<
  PipelineSingleValueOperator,
  (amount: number) => SQL
> = {
  eq: (amount) => eq(pipelineItemModel.value, amount),
  gt: (amount) => gt(pipelineItemModel.value, amount),
  lt: (amount) => lt(pipelineItemModel.value, amount),
  ne: (amount) => sql`${pipelineItemModel.value} is distinct from ${amount}`,
}

/** The item's `value` condition, covering both the legacy interval and operators. */
const valueConditions = (value: PipelineItemFilter["value"]): SQL[] => {
  if (!value) {
    return []
  }
  const { operator, amount, min, max } = value
  if (isSingleValueOperator(operator)) {
    return amount === undefined
      ? []
      : [SINGLE_VALUE_CONDITION[operator](amount)]
  }
  return [
    ...(min === undefined ? [] : [gte(pipelineItemModel.value, min)]),
    ...(max === undefined ? [] : [lte(pipelineItemModel.value, max)]),
  ]
}

const activityExists = (kind: PipelineActivityKind, range: DateRange) =>
  exists(
    sql`(select 1 from ${pipelineItemActivityModel} where ${allOf(
      eq(pipelineItemActivityModel.workspaceId, pipelineItemModel.workspaceId),
      eq(pipelineItemActivityModel.itemId, pipelineItemModel.id),
      // Only history recorded in the item's current pipeline (see activityMatch).
      eq(pipelineItemActivityModel.pipelineId, pipelineItemModel.pipelineId),
      eq(pipelineItemActivityModel.kind, kind),
      ...rangeConditions(pipelineItemActivityModel.occurredAt, range),
    )})`,
  )

/** Who did it: the listed users or automation (OR); undefined when neither is set. */
const activityActorCondition = (match: PipelineActivityMatch) => {
  const branches: SQL[] = []
  if (match.actorUserIds?.length) {
    branches.push(
      allOf(
        eq(pipelineItemActivityModel.actorKind, "user"),
        inArray(pipelineItemActivityModel.actorUserId, match.actorUserIds),
      ),
    )
  }
  if (match.automation) {
    branches.push(
      inArray(pipelineItemActivityModel.actorKind, [...AUTOMATION_ACTOR_KINDS]),
    )
  }
  return branches.length > 0 ? or(...branches) : undefined
}

/**
 * One activity row satisfying every set part. Rows are limited to the item's
 * current pipeline, so history recorded before a transfer (possibly in a
 * pipeline the viewer cannot see) never influences the result.
 */
const activityMatchExists = (match: PipelineActivityMatch) =>
  exists(
    sql`(select 1 from ${pipelineItemActivityModel} where ${allOf(
      eq(pipelineItemActivityModel.workspaceId, pipelineItemModel.workspaceId),
      eq(pipelineItemActivityModel.itemId, pipelineItemModel.id),
      eq(pipelineItemActivityModel.pipelineId, pipelineItemModel.pipelineId),
      match.kinds?.length
        ? inArray(pipelineItemActivityModel.kind, match.kinds)
        : undefined,
      activityActorCondition(match),
      ...rangeConditions(
        pipelineItemActivityModel.occurredAt,
        match.occurredAt,
      ),
    )})`,
  )

const hasActivityMatch = (match: PipelineActivityMatch | undefined) =>
  match !== undefined &&
  Boolean(
    match.kinds?.length ||
      match.actorUserIds?.length ||
      match.automation ||
      match.occurredAt?.from ||
      match.occurredAt?.to,
  )

/**
 * Builds the shared WHERE of every board/list query. All dynamic values are
 * bound parameters; field ids are bound as text keys, never interpolated.
 */
export function buildPipelineItemWhere(
  base: { workspaceId: string; pipelineId?: string },
  filter: PipelineItemFilter = {},
): SQL {
  const conditions: Array<SQL | undefined> = [
    eq(pipelineItemModel.workspaceId, base.workspaceId),
    base.pipelineId
      ? eq(pipelineItemModel.pipelineId, base.pipelineId)
      : undefined,
    filter.stageIds?.length
      ? inArray(pipelineItemModel.stageId, filter.stageIds)
      : undefined,
    filter.statuses?.length
      ? inArray(pipelineItemModel.status, filter.statuses)
      : undefined,
    filter.priorities?.length
      ? inArray(pipelineItemModel.priority, filter.priorities)
      : undefined,
    filter.contactId
      ? eq(pipelineItemModel.contactId, filter.contactId)
      : undefined,
    ...valueConditions(filter.value),
    ...rangeConditions(pipelineItemModel.dueDate, filter.dueDate),
    ...rangeConditions(pipelineItemModel.createdAt, filter.createdAt),
    ...rangeConditions(pipelineItemModel.updatedAt, filter.updatedAt),
    ...rangeConditions(pipelineItemModel.closedAt, filter.closedAt),
    closedAsCondition(filter.closedAs),
    ...rangeConditions(pipelineItemModel.lastCommentAt, filter.lastCommentAt),
    ...rangeConditions(
      pipelineItemModel.statusChangedAt,
      filter.statusChangedAt,
    ),
    ...rangeConditions(pipelineItemModel.stageEnteredAt, filter.stageEnteredAt),
  ]

  const assigneeConditions: SQL[] = []
  if (filter.assigneeMemberIds?.length) {
    assigneeConditions.push(
      inArray(
        pipelineItemAssigneeModel.workspaceMemberId,
        filter.assigneeMemberIds,
      ),
    )
  }
  if (filter.assigneeTeamIds?.length) {
    assigneeConditions.push(
      inArray(pipelineItemAssigneeModel.inboxTeamId, filter.assigneeTeamIds),
    )
  }
  if (assigneeConditions.length > 0) {
    conditions.push(
      exists(
        sql`(select 1 from ${pipelineItemAssigneeModel} where ${allOf(
          eq(pipelineItemAssigneeModel.itemId, pipelineItemModel.id),
          or(...assigneeConditions),
        )})`,
      ),
    )
  }

  const search = filter.search?.trim()
  if (search) {
    const numeric = NUMERIC_SEARCH_PATTERN.test(search)
      ? search.replace("#", "")
      : null
    conditions.push(
      or(
        ilike(pipelineItemModel.title, likeContains(search)),
        numeric
          ? sql`${pipelineItemModel.number}::text = ${numeric}`
          : undefined,
        exists(
          sql`(select 1 from ${contactModel} where ${allOf(
            eq(contactModel.id, pipelineItemModel.contactId),
            eq(contactModel.workspaceId, pipelineItemModel.workspaceId),
            or(
              ...contactSearchConditions(
                search,
                filter.searchContactEmailAndPhone !== false,
              ),
            ),
          )})`,
        ),
      ),
    )
  }

  for (const [fieldId, condition] of Object.entries(
    filter.fieldConditions ?? {},
  )) {
    const fieldType = filter.fieldTypes?.[fieldId]
    if (fieldType) {
      conditions.push(
        fieldConditionSql(fieldId, fieldType, condition, filter.timezone),
      )
    }
  }
  if (filter.activityMatch && hasActivityMatch(filter.activityMatch)) {
    conditions.push(activityMatchExists(filter.activityMatch))
  }
  for (const kind of pipelineActivityKinds.options) {
    const range = filter.activity?.[kind]
    if (range) {
      conditions.push(activityExists(kind, range))
    }
  }

  return allOf(...conditions)
}
