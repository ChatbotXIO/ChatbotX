import type { SQL } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { customFieldTypes, operatorTypes } from "../../partials"
import { contactCustomFieldModel, customFieldModel } from "../../schema"
import { existsWhere } from "./exists"
import {
  buildDatetimeGuard,
  buildFieldValuePositivePredicate,
  buildTemporalBranchPredicate,
  type FieldValueComparison,
  getFieldIntervalValue,
  resolveFieldValueNegation,
} from "./field-value-predicates"
import type { ContactWhere } from "./types"

export function buildCustomFieldWhere(condition: {
  customFieldId?: string
  operator: string
  value?: unknown
  customFieldType?: string
  valueType?: string
  timezone: string
}): ContactWhere {
  if (!condition.customFieldId) {
    return {}
  }
  const comparison = buildCustomFieldComparison(
    condition.customFieldId,
    condition.operator,
    condition.value,
    condition.customFieldType,
    condition.valueType,
    condition.timezone,
  )
  if (!comparison) {
    return {}
  }

  return existsWhere(
    (contactId) =>
      sql`SELECT 1 FROM ${contactCustomFieldModel} WHERE ${contactCustomFieldModel.contactId} = ${contactId} AND ${contactCustomFieldModel.customFieldId} = ${condition.customFieldId} AND ${comparison.predicate}`,
    comparison.negate,
  )
}

function buildCustomFieldComparison(
  customFieldId: string,
  operator: string,
  value: unknown,
  customFieldType: string | undefined,
  valueType: string | undefined,
  timezone: string,
): FieldValueComparison | undefined {
  const { positiveOperator, negate } = resolveFieldValueNegation(operator)
  const predicate = buildCustomFieldPositivePredicate(
    positiveOperator,
    customFieldId,
    value,
    customFieldType,
    valueType,
    timezone,
  )
  return predicate ? { predicate, negate } : undefined
}

/**
 * `customFieldType` is absent on filters saved before that field existed.
 * Those legacy rows can't tell a `date` from a `datetime` field up front, so
 * (for the `datetime` valueType only) both interpretations are built and
 * combined with a runtime lookup against `CustomFieldModel.type`. `botField`
 * conditions always carry a type (see `bot-field-predicates.ts`) and never
 * need this branch.
 */
function buildCustomFieldPositivePredicate(
  operator: string,
  customFieldId: string,
  value: unknown,
  customFieldType: string | undefined,
  valueType: string | undefined,
  timezone: string,
): SQL | undefined {
  const column = contactCustomFieldModel.value

  if (
    valueType === "datetime" &&
    customFieldType === undefined &&
    operator !== operatorTypes.enum.isNotEmpty
  ) {
    return buildLegacyTemporalCustomFieldPredicate(
      operator,
      customFieldId,
      value,
      getFieldIntervalValue(value),
      timezone,
      buildDatetimeGuard(column),
    )
  }

  return buildFieldValuePositivePredicate({
    column,
    customFieldType,
    operator,
    timezone,
    value,
    valueType,
  })
}

function buildLegacyTemporalCustomFieldPredicate(
  operator: string,
  customFieldId: string,
  value: unknown,
  intervalValue: [string, string] | undefined,
  timezone: string,
  guard: SQL,
): SQL | undefined {
  const column = contactCustomFieldModel.value
  const datePredicate = buildTemporalBranchPredicate({
    column,
    guard,
    intervalValue,
    isDateField: true,
    operator,
    timezone,
    value,
  })
  const datetimePredicate = buildTemporalBranchPredicate({
    column,
    guard,
    intervalValue,
    isDateField: false,
    operator,
    timezone,
    value,
  })

  if (!(datePredicate && datetimePredicate)) {
    return
  }

  const isDateField = sql`EXISTS (
    SELECT 1
    FROM ${customFieldModel}
    WHERE ${customFieldModel.id} = ${customFieldId}
      AND ${customFieldModel.type} = ${customFieldTypes.enum.date}
  )`

  return sql`((${isDateField} AND ${datePredicate}) OR (NOT ${isDateField} AND ${datetimePredicate}))`
}
