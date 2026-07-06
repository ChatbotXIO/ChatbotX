import type { ContactFilterField } from "@chatbotx.io/database/partials"
import type { ContactFilterCondition } from "../schemas"

export const pruneExcludedConditions = (
  conditions: ContactFilterCondition[],
  excludeFields: ContactFilterField[],
): ContactFilterCondition[] => {
  if (excludeFields.length === 0) {
    return conditions
  }

  return conditions.filter(
    (condition) =>
      !excludeFields.includes(condition.field as ContactFilterField),
  )
}
