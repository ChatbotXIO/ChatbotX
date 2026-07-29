import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { COUPON_TOPIC_OPERATORS } from "../schemas/coupon-topic-filter"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"
import type { CustomFieldValueInputConfig } from "./custom-field-filter-config"

const COUPON_TOPIC_OPERATOR_ORDER = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.used,
  operatorTypes.enum.eq,
] as const satisfies readonly OperatorType[]

const isValuelessOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.isNotEmpty ||
  operator === operatorTypes.enum.used

export const getCouponTopicConditionOptions = (
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  const enabledOperators = new Set<OperatorType>(COUPON_TOPIC_OPERATORS)
  const optionByOperator = new Map(
    conditionOptions.map((option) => [option.value, option]),
  )

  return COUPON_TOPIC_OPERATOR_ORDER.map((operator) => {
    const option = optionByOperator.get(operator)
    return {
      value: operator,
      label: option?.label ?? operator,
      disabled: !enabledOperators.has(operator),
    }
  })
}

/**
 * Value input for a coupon-topic condition: none for `isNotEmpty`/`used`
 * (the topic itself is already the field), a free-text coupon code for `eq`.
 */
export const getCouponTopicValueInputConfig = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): CustomFieldValueInputConfig | undefined => {
  if (!config?.topicId) {
    return
  }
  if (isValuelessOperator(operator)) {
    return { kind: "none", defaultValue: "" }
  }

  return { kind: "text", defaultValue: "" }
}

export const getDefaultCouponTopicValue = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): string | string[] =>
  getCouponTopicValueInputConfig(config, operator)?.defaultValue ?? ""
