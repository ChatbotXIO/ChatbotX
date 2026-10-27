import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import {
  MAX_PIPELINE_ITEM_FILTER_STAGE_IDS,
  PIPELINE_ITEM_EXISTS_VALUES,
  type PipelineItemExistsValue,
  type PipelineItemFilterAttribute,
  type PipelineItemPriority,
  type PipelineItemStatus,
  pipelineItemFilterAttributes,
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "../../partials/pipeline"
import { pipelineItemModel } from "../../schema"
import { isBigintId } from "../../utils"
import { existsWhere } from "./exists"
import type { ContactWhere } from "./types"

/** A saved id is canonical: a positive bigint with no leading zero. */
const isCanonicalBigintId = (value: unknown): value is string =>
  typeof value === "string" && !value.startsWith("0") && isBigintId(value)

// A saved condition that cannot be evaluated must fail CLOSED: returning `{}`
// would drop it from an AND group and widen the audience.
const matchesNobody: ContactWhere = { RAW: () => sql`FALSE` }

type PipelineItemConditionInput = {
  attribute?: string
  pipelineId?: string | null
  operator: string
  value?: unknown
}

const parseEnumList = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return
  }
  const unique = [...new Set(value)]
  return unique.every((item): item is T => allowed.includes(item as T))
    ? unique
    : undefined
}

const parseStageIds = (value: unknown): string[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PIPELINE_ITEM_FILTER_STAGE_IDS
  ) {
    return
  }
  const unique = [...new Set(value)]
  return unique.every(isCanonicalBigintId) ? unique : undefined
}

type ItemWhere = (extra?: SQL) => (contactId: AnyColumn) => SQL

type AttributeContext = {
  operator: string
  value: unknown
  pipelineId: string | null
  itemWhere: ItemWhere
}

type AttributeHandler = (context: AttributeContext) => ContactWhere

/** One item's test for a membership attribute; undefined when the value is unusable. */
type ItemTest = (context: AttributeContext) => SQL | undefined

// Maps, not object literals: an operator such as "constructor" must find
// nothing (fail closed), never an inherited `Object.prototype` member.

/** `in` matches contacts with such an item; `notIn` those without one. */
const MEMBERSHIP_NEGATES: ReadonlyMap<string, boolean> = new Map([
  [operatorTypes.enum.in, false],
  [operatorTypes.enum.notIn, true],
])

/** `isNotEmpty` matches contacts with such an item; `isEmpty` those without one. */
const EXISTS_NEGATES: ReadonlyMap<string, boolean> = new Map([
  [operatorTypes.enum.isNotEmpty, false],
  [operatorTypes.enum.isEmpty, true],
])

const membership =
  (test: ItemTest): AttributeHandler =>
  (context) => {
    const negate = MEMBERSHIP_NEGATES.get(context.operator)
    const itemTest = negate === undefined ? undefined : test(context)
    return itemTest && negate !== undefined
      ? existsWhere(context.itemWhere(itemTest), negate)
      : matchesNobody
  }

/**
 * `column IN (...)` over values checked against their enum, cast to its type.
 * The column is read per call, so importing this module never touches the
 * schema (tests that mock `@chatbotx.io/database/schema` stay unaffected).
 */
const enumIn =
  <T extends string>(
    column: "status" | "priority",
    allowed: readonly T[],
    pgType: string,
  ): ItemTest =>
  ({ value }) => {
    const values = parseEnumList(value, allowed)
    return values
      ? sql`${pipelineItemModel[column]} IN (${sql.join(
          values.map((entry) => sql`${entry}::${sql.identifier(pgType)}`),
          sql`, `,
        )})`
      : undefined
  }

const ATTRIBUTE_HANDLERS: Record<
  PipelineItemFilterAttribute,
  AttributeHandler
> = {
  exists: ({ operator, value, itemWhere }) => {
    const negate = EXISTS_NEGATES.get(operator)
    if (
      negate === undefined ||
      !PIPELINE_ITEM_EXISTS_VALUES.includes(value as PipelineItemExistsValue)
    ) {
      return matchesNobody
    }
    const status = value as PipelineItemExistsValue
    return existsWhere(
      itemWhere(
        status === "any"
          ? undefined
          : sql`${pipelineItemModel.status} = ${status}::"pipelineItemStatus"`,
      ),
      negate,
    )
  },
  status: membership(
    enumIn<PipelineItemStatus>(
      "status",
      pipelineItemStatuses.options,
      "pipelineItemStatus",
    ),
  ),
  priority: membership(
    enumIn<PipelineItemPriority>(
      "priority",
      pipelineItemPriorities.options,
      "pipelineItemPriority",
    ),
  ),
  // Stage ids are only meaningful inside one pipeline; the item's own
  // `pipelineId` match makes a stage of another pipeline match nothing.
  stage: membership(({ value, pipelineId }) => {
    const stageIds = parseStageIds(value)
    return stageIds && pipelineId !== null
      ? sql`${pipelineItemModel.stageId} IN (${sql.join(
          stageIds.map((id) => sql`${id}::bigint`),
          sql`, `,
        )})`
      : undefined
  }),
}

/**
 * "Pipeline item" contact condition. Every shape is a workspace-scoped
 * correlated `EXISTS` over `PipelineItem` (positive operators) or its
 * `NOT EXISTS` twin (`isEmpty`, `notIn`), so a contact without any matching
 * item satisfies the negative operators. Every user-supplied value is a bound
 * parameter.
 */
export const buildPipelineItemConditionWhere = (
  condition: PipelineItemConditionInput,
  workspaceId: string | undefined,
): ContactWhere => {
  const attribute = pipelineItemFilterAttributes.safeParse(condition.attribute)
  const pipelineId = condition.pipelineId ?? null
  if (
    !(workspaceId && attribute.success) ||
    (pipelineId !== null && !isCanonicalBigintId(pipelineId))
  ) {
    return matchesNobody
  }

  const itemWhere: ItemWhere = (extra) => (contactId) =>
    sql`SELECT 1 FROM ${pipelineItemModel}
      WHERE ${pipelineItemModel.workspaceId} = ${workspaceId}::bigint
        AND ${pipelineItemModel.contactId} = ${contactId}
        ${pipelineId === null ? sql`` : sql`AND ${pipelineItemModel.pipelineId} = ${pipelineId}::bigint`}
        ${extra ? sql`AND ${extra}` : sql``}`

  return ATTRIBUTE_HANDLERS[attribute.data]({
    operator: condition.operator,
    value: condition.value,
    pipelineId,
    itemWhere,
  })
}
