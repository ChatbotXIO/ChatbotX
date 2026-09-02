import { sql } from "drizzle-orm"
import { botFieldModel } from "../../schema"
import { existsWhere } from "./exists"
import {
  buildFieldValuePositivePredicate,
  type FieldValueComparison,
  resolveFieldValueNegation,
} from "./field-value-predicates"
import type { ContactWhere } from "./types"

/**
 * `botField` conditions filter on `BotField` — a workspace-level table (one
 * row per field per workspace, value stored directly on the row) — NOT a
 * per-contact table. The EXISTS subquery below is therefore uncorrelated to
 * the contact id: it evaluates to the same boolean for every contact in the
 * workspace, which is the intended "does this workspace's bot field satisfy
 * X" semantics (see `.agents/skills/contact-filter/SKILL.md` and the task
 * description this condition kind was added for).
 *
 * `workspaceId` is required to scope the lookup — without it (e.g. a caller
 * that never threads a workspace scope into `applyContactFilter`) the
 * condition safely no-ops (`{}`) rather than matching/rejecting every contact
 * on an unscoped read of `BotField`.
 */
export function buildBotFieldWhere(condition: {
  botFieldId?: string
  operator: string
  value?: unknown
  botFieldType?: string
  valueType?: string
  timezone: string
  workspaceId?: string
}): ContactWhere {
  if (!(condition.botFieldId && condition.workspaceId)) {
    return {}
  }
  const comparison = buildBotFieldComparison(
    condition.operator,
    condition.value,
    condition.botFieldType,
    condition.valueType,
    condition.timezone,
  )
  if (!comparison) {
    return {}
  }

  const { botFieldId, workspaceId } = condition

  return existsWhere(
    () =>
      sql`SELECT 1 FROM ${botFieldModel} WHERE ${botFieldModel.workspaceId} = ${workspaceId} AND ${botFieldModel.id} = ${botFieldId} AND ${comparison.predicate}`,
    comparison.negate,
  )
}

function buildBotFieldComparison(
  operator: string,
  value: unknown,
  botFieldType: string | undefined,
  valueType: string | undefined,
  timezone: string,
): FieldValueComparison | undefined {
  const { positiveOperator, negate } = resolveFieldValueNegation(operator)
  const predicate = buildFieldValuePositivePredicate({
    column: botFieldModel.value,
    customFieldType: botFieldType,
    operator: positiveOperator,
    timezone,
    value,
    valueType,
  })
  return predicate ? { predicate, negate } : undefined
}
