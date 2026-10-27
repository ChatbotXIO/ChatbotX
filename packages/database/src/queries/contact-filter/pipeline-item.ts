import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import {
  MAX_PIPELINE_ITEM_FILTER_STAGE_IDS,
  PIPELINE_ITEM_EXISTS_VALUES,
  type PipelineItemExistsValue,
  type PipelineItemPriority,
  type PipelineItemStatus,
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
  const { attribute, operator, value } = condition
  const pipelineId = condition.pipelineId ?? null
  if (
    !workspaceId ||
    (pipelineId !== null && !isCanonicalBigintId(pipelineId))
  ) {
    return matchesNobody
  }

  const itemWhere =
    (extra?: SQL) =>
    (contactId: AnyColumn): SQL =>
      sql`SELECT 1 FROM ${pipelineItemModel}
      WHERE ${pipelineItemModel.workspaceId} = ${workspaceId}::bigint
        AND ${pipelineItemModel.contactId} = ${contactId}
        ${pipelineId === null ? sql`` : sql`AND ${pipelineItemModel.pipelineId} = ${pipelineId}::bigint`}
        ${extra ? sql`AND ${extra}` : sql``}`

  if (attribute === "exists") {
    if (
      !(
        operator === operatorTypes.enum.isNotEmpty ||
        operator === operatorTypes.enum.isEmpty
      )
    ) {
      return matchesNobody
    }
    if (
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
      operator === operatorTypes.enum.isEmpty,
    )
  }

  if (
    !(
      operator === operatorTypes.enum.in ||
      operator === operatorTypes.enum.notIn
    )
  ) {
    return matchesNobody
  }
  const negate = operator === operatorTypes.enum.notIn

  if (attribute === "status") {
    const statuses = parseEnumList<PipelineItemStatus>(
      value,
      pipelineItemStatuses.options,
    )
    return statuses
      ? existsWhere(
          itemWhere(
            sql`${pipelineItemModel.status} IN (${sql.join(
              statuses.map((status) => sql`${status}::"pipelineItemStatus"`),
              sql`, `,
            )})`,
          ),
          negate,
        )
      : matchesNobody
  }

  if (attribute === "priority") {
    const priorities = parseEnumList<PipelineItemPriority>(
      value,
      pipelineItemPriorities.options,
    )
    return priorities
      ? existsWhere(
          itemWhere(
            sql`${pipelineItemModel.priority} IN (${sql.join(
              priorities.map(
                (priority) => sql`${priority}::"pipelineItemPriority"`,
              ),
              sql`, `,
            )})`,
          ),
          negate,
        )
      : matchesNobody
  }

  if (attribute === "stage") {
    const stageIds = parseStageIds(value)
    // Stage ids are only meaningful inside one pipeline; the item's own
    // `pipelineId` match makes a stage of another pipeline match nothing.
    return stageIds && pipelineId !== null
      ? existsWhere(
          itemWhere(
            sql`${pipelineItemModel.stageId} IN (${sql.join(
              stageIds.map((id) => sql`${id}::bigint`),
              sql`, `,
            )})`,
          ),
          negate,
        )
      : matchesNobody
  }

  return matchesNobody
}
