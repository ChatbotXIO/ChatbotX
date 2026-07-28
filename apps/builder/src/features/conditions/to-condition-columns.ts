import type { ConditionInput } from "./schemas"

export const toConditionColumns = (condition: ConditionInput) => ({
  type: condition.type,
  sourceId: "sourceId" in condition ? condition.sourceId : null,
  operator: "operator" in condition ? condition.operator : null,
  value:
    "value" in condition && condition.value !== null ? condition.value : null,
})
