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

// Same operator-per-type table as `custom-field-filter.ts`'s
// `operatorsForCustomField` — `BotField` and `CustomField` share the same
// `CustomFieldType` enum and value semantics (workspace-defined text value +
// a form/value-input type), so the enabled-operator rules must stay
// identical. Kept as a sibling function (not imported) so each condition
// kind's Zod schema stays self-contained and independently testable, mirroring
// how `custom-field-filter.ts` is not itself shared with anything else.
const operatorsForBotField = (
  valueType: FormFieldType,
  botFieldType?: CustomFieldType,
): readonly OperatorType[] => {
  if (botFieldType === customFieldTypes.enum.longText) {
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
 * Dynamic per-bot-field condition — the workspace-level ("Account Field")
 * counterpart of `customFieldConditionSchema`. One filter field per workspace
 * bot field, carrying `botFieldId` + `valueType` the same way `customField`
 * carries `customFieldId` + `valueType`. Unlike custom fields, a bot field
 * has no contact relation: the backend predicate (`bot-field-predicates.ts`)
 * matches every contact in the workspace the same way.
 */
export const botFieldConditionSchema = z
  .object({
    field: z.literal("botField"),
    botFieldId: z.string().min(1),
    botFieldType: customFieldTypes.optional(),
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
    const enabledOperators = operatorsForBotField(
      condition.valueType,
      condition.botFieldType,
    )

    if (!enabledOperators.includes(condition.operator)) {
      ctx.addIssue({
        code: "custom",
        message: "Operator is not supported for this bot field",
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

export type BotFieldCondition = z.infer<typeof botFieldConditionSchema>
