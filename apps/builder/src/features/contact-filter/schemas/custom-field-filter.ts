import {
  type CustomFieldType,
  customFieldTypes,
  type FormFieldType,
  formFieldTypes,
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

const VALUELESS_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const BASE_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  ...VALUELESS_OPERATORS,
] as const satisfies readonly OperatorType[]

const TEXT_SEARCH_OPERATORS = [
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
] as const satisfies readonly OperatorType[]

const RANGE_OPERATORS = [
  operatorTypes.enum.gt,
  operatorTypes.enum.lt,
  operatorTypes.enum.gte,
  operatorTypes.enum.lte,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
] as const satisfies readonly OperatorType[]

const TEXT_OPERATORS = [
  ...BASE_OPERATORS,
  ...TEXT_SEARCH_OPERATORS,
] as const satisfies readonly OperatorType[]

const LONG_TEXT_OPERATORS = BASE_OPERATORS

const NUMBER_OPERATORS = [
  ...BASE_OPERATORS,
  ...RANGE_OPERATORS,
  ...TEXT_SEARCH_OPERATORS,
] as const satisfies readonly OperatorType[]

const DATE_OPERATORS = [
  ...BASE_OPERATORS,
  ...RANGE_OPERATORS,
] as const satisfies readonly OperatorType[]

const BOOLEAN_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const operatorsForCustomField = (
  valueType: FormFieldType,
  customFieldType?: CustomFieldType,
): readonly OperatorType[] => {
  if (customFieldType === customFieldTypes.enum.longText) {
    return LONG_TEXT_OPERATORS
  }

  switch (valueType) {
    case formFieldTypes.enum.number:
      return NUMBER_OPERATORS
    case formFieldTypes.enum.datetime:
      return DATE_OPERATORS
    case formFieldTypes.enum.boolean:
      return BOOLEAN_OPERATORS
    default:
      return TEXT_OPERATORS
  }
}

const isValuelessOperator = (operator: OperatorType): boolean =>
  (VALUELESS_OPERATORS as readonly OperatorType[]).includes(operator)

const isIntervalOperator = (operator: OperatorType): boolean =>
  operator === operatorTypes.enum.isBetween ||
  operator === operatorTypes.enum.notBetween

/**
 * Dynamic per-custom-field condition. Unlike the static field branches, custom
 * fields are runtime data (one filter field per workspace custom field), so they
 * cannot be encoded as `field` literals in the static discriminated union.
 * Instead a single `field: "customField"` branch carries `customFieldId` plus
 * `valueType` (the form/value-input type derived from the custom field type) so
 * the UI and the SQL mapper know how to render and compare the value.
 */
export const customFieldConditionSchema = z
  .object({
    field: z.literal("customField"),
    customFieldId: z.string().min(1),
    customFieldType: customFieldTypes.optional(),
    valueType: formFieldTypes,
    operator: operatorTypes,
    value: z
      .union([
        sampleStringSchema,
        z.tuple([sampleStringSchema, sampleStringSchema]),
      ])
      .optional(),
  })
  .superRefine((condition, ctx) => {
    const enabledOperators = operatorsForCustomField(
      condition.valueType,
      condition.customFieldType,
    )

    if (!enabledOperators.includes(condition.operator)) {
      ctx.addIssue({
        code: "custom",
        message: "Operator is not supported for this custom field",
        path: ["operator"],
      })
      return
    }

    if (isValuelessOperator(condition.operator)) {
      return
    }

    if (isIntervalOperator(condition.operator)) {
      if (!(Array.isArray(condition.value) && condition.value.length === 2)) {
        ctx.addIssue({
          code: "custom",
          message: "Interval operators require two values",
          path: ["value"],
        })
      }
      return
    }

    if (typeof condition.value !== "string" || condition.value.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Operator requires a value",
        path: ["value"],
      })
    }
  })

export type CustomFieldCondition = z.infer<typeof customFieldConditionSchema>
